### `transform stream`

`through2` 是一个 `transform stream` 的封装库，用来处理 `node` 的 `stream`，源码虽然仅仅只有 100 多行，但是里面的内容确实很有看头的！

#### `Transform` 概念

`Transform` 是一个变换流，既可读也可写 是双工流 `Duplex` 的特殊形式。`Duplex` 的写和读没有任何关联，两个缓冲区和管道互不干扰，而 `Transform` 将其输入和输出是存在相互关联，通过转换函数将流进行转换。

#### `transform stream` 简单案例

实现一个用来将目标字符串替换成指定字符串的变换流：

```js

// replaceStream.ts

import { Transform } from "stream";

export default class ReplaceStream extends Transform {
  constructor(
    private searchString: string,
    private replaceString: string,
    private tailPiece: string = ""
  ) {
    super();
  }
  _transform(chunk, encoding, callback) {
    const pieces = (this.tailPiece + chunk).split(this.searchString);
    const lastPiece = pieces[pieces.length - 1];
    const tailPieceLen = this.searchString.length - 1;

    this.tailPiece = lastPiece.slice(-tailPieceLen);
    pieces[pieces.length - 1] = lastPiece.slice(0, -tailPieceLen);
    this.push(pieces.join(this.replaceString));

    callback();
  }

  /**
  某些情况下，转换操作可能需要在流的末尾发送一些额外的数据。
  */
  _flush(callback) {
    this.push(this.tailPiece);
    this.push("\n")
    this.push("haha")
    callback();
  }
}


// replaceStreamTest.ts

import ReplaceStream from "./replaceStream";

const re = new ReplaceStream("World", "Nodejs");

re.on("data", chunk => console.log(chunk.toString()));

re.write("hello w");
re.write("orld");
re.end();

```

创建一个新的类并继承 `stream.Transform` 这个基类。该类的构造函数接受两个参数：`searchString` 和 `replaceString`。这两个参数用于指定需要查找匹配的字符串以及用来替换的字符串。同时还初始化了一个内部变量 `tailPieceLen` 提供给 `_transform()` 方法使用。

`_transform()` 方法和 `_write()` 方法有相同的方法签名，但并不是将数据直接写到底层资源，而是使用 `this.push()` 方法将其推送到内部缓存，就像我们在可读流 `_read()` 方法中做的一样。这就说明了变换流中的两部分事实上被连接起来。

`_flush()` 方法只接受一个回调函数作为参数，必须确保在所有操作完成之后调用它，使流终结。

### `through2` 核心源码解读

`through2.js` 是 `Transform stream` 的简单封装库，用起来非常简单，下面来看下它的核心代码。

```js
function through2(construct) {
  return function throughHOC(options, transform, flush) {
    if (typeof options == "function") {
      flush = transform;
      transform = options;
      options = {};
    }

    if (typeof transform != "function") transform = noop;

    if (typeof flush != "function") flush = null;

    return construct(options, transform, flush);
  };
}
```

这是段工厂函数，`through2.js` 的三个 `api` 都是由这个方法生成的。

同时 `through2` 也是一个高阶函数，接收一个参数，这个参数 `construct` 是一个函数，在这个项目中这个形参将有三个实参，也就是对应的三个 `API`。

`through2` 也返回一个高阶函数，为了能更好的认识这个函数，命名为 `throughHOC`， 它有三个形式参数：

- `options` `Transform` 类的实例参数
- `transform` 实际转换函数
- `flush` 方法只接受一个回调函数作为参数，必须确保在所有操作完成之后调用它，使流终结

函数 `throughHOC` 内部对参数做了一些整理：

- 如果 `options` 是一个 `function` ，那这个 `options` 就是转换函数，`options` 则会是一个默认值；
- 如果 `options` 存在且 `transform` 不是一个 `function` ，那 `transform` 就被重置为默认转换函数；
- 如果 `flush` 不是一个 `function` ，则重置为 `null`

参数整理完了，就把它们作为参数，传入 `construct` 函数内。这个 `construct` 就是实现三个 `API` 的方法。

说 `API` 方法之前，先说下 `Transform` 类的加工 -- `DestroyableTransform`：

```js
function DestroyableTransform(opts) {
  Transform.call(this, opts);
  this._destroyed = false;
}

inherits(DestroyableTransform, Transform);

DestroyableTransform.prototype.destroy = function(err) {
  if (this._destroyed) return;
  this._destroyed = true;

  var self = this;
  process.nextTick(function() {
    if (err) self.emit("error", err);
    self.emit("close");
  });
};
```

`DestroyableTransform` 继承 `Transform` ，实现了 `destroy` 方法，当触发了 `destroy` 后，需要手动触发 `close` 事件。

下面就来说下实现三个 `API` 的函数：

> 主方法

```js
let construct = function(options, transform, flush) {
  var t2 = new DestroyableTransform(options);

  t2._transform = transform;

  if (flush) t2._flush = flush;

  return t2;
};

module.exports = through2(construct);
```

上面说过了 `through2` 函数，它的参数就是上面的 `construct` 函数，首先 实例化 `DestroyableTransform` 这个类，`options` 就是通过外部传入的配置参数，接下来就是重新实现了 `_transform` 和 `_flush` 这两个方法。

> `through2.obj`

这个 `API` 和主方法唯一的区别就是开启了对象模式，将 `objectMode` 属性设置为 `true`，`highWaterMark` 属性设置为 `16`

```js
var t2 = new DestroyableTransform(
  Object.assign({ objectMode: true, highWaterMark: 16 }, options)
);
```

> `through2.ctor`

这个 `API` 返回的是 `DestroyableTransform` 的子类，并不是 `Transform stream` 的实例，这个在使用的时候其实和主方法唯一的区别就是需要额外实例化这个 `API` 返回值。

```js
let construct = function(options, transform, flush) {
  function Through2(override) {
    if (!(this instanceof Through2)) return new Through2(override);

    this.options = Object.assign({}, options, override);

    DestroyableTransform.call(this, this.options);
  }

  inherits(Through2, DestroyableTransform);

  Through2.prototype._transform = transform;

  if (flush) Through2.prototype._flush = flush;

  return Through2;
};

module.exports.ctor = through2(construct);
```

使用：

```js
const through2 = require("through2");
const Ctor = through2.ctor(function(chunk, enc, callback) {
  console.log("chunk", chunk.toString());
  callback(null, chunk);
});
const th2 = new Ctor();
```

### `through2` 使用 `typescript` 重构

不得不感叹这个项目的厉害之处，仅仅只是对 `Transform` 做了一层简单的封装，却透出了很多内容，项目中虽然只是额外扩展了两个 `api`，但是熟悉源码之后就可以对它做更多的扩展了。这也不得不说转换流 `Transform` 的强大之处。

在学习源码之后，用 `typescript` 重构了一下，对代码更加的清晰，有了更多的认识，值得好好学习。
