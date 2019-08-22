import { Transform, TransformOptions, TransformCallback } from "stream";

interface IConstruct<T> {
  (options: TransformOptions, transform: ITransformFunc, flush: IFlushFunc): T;
}

interface ITransformFunc {
  (chunk: any, enc: any, callback: TransformCallback): void;
}

interface IFlushFunc {
  (callback: TransformCallback): void;
}

interface IThrough2<T> {
  (
    options: TransformOptions | ITransformFunc,
    transform?: ITransformFunc,
    flush?: IFlushFunc
  ): T;
}

// 空转换方法
function noop(chunk, enc, callback: TransformCallback) {
  callback(null, chunk);
}

/**
 * 工厂函数
 * @param construct
 */
function through<T extends Transform>(construct: IConstruct<T>): IThrough2<T> {
  return function(
    options: TransformOptions | ITransformFunc,
    transform: ITransformFunc,
    flush: IFlushFunc
  ) {
    // 首先对参数进行类型判断
    if (typeof options == "function") {
      // 第一个参数为 function 时，则默认第一个是transform
      flush = transform as IFlushFunc;
      transform = options;
      options = {};
    }
    if (typeof transform != "function") {
      // transform 函数设置为默认方法
      transform = noop;
    }
    if (typeof flush != "function") {
      // flush 只能是一个函数
      flush = null;
    }

    return construct(options, transform, flush);
  };
}

class DestroyableTransform extends Transform {
  private _destroyed: boolean = false;
  constructor(options?: TransformOptions) {
    super(options);
  }

  /**
   * 销毁流
   * @param err
   */
  destroy(err?: Error) {
    if (this._destroyed) return;
    this._destroyed = true;
    process.nextTick(() => {
      if (err) {
        this.emit("error", err);
      }
      this.emit("close");
    });
  }
}

/**
 * 创建一个转换流
 */
const through2 = through<DestroyableTransform>(function(
  options: TransformOptions,
  transform: ITransformFunc,
  flush: IFlushFunc
) {
  let th2 = new DestroyableTransform(options);
  th2._transform = transform;
  if (flush) {
    th2._flush = flush;
  }
  return th2;
});

/**
 * 重写构造函数
 */
export const ctor = through<any>(function(
  options: TransformOptions,
  transform: ITransformFunc,
  flush: IFlushFunc
) {
  class Through2 extends DestroyableTransform {
    constructor(override: TransformOptions) {
      super(Object.assign({}, options, override));
    }
  }
  Through2.prototype._transform = transform;
  if (flush) {
    Through2.prototype._flush = flush;
  }
  return Through2;
});

/**
 * 对象模式
 */
export const obj = through<DestroyableTransform>(function(
  options: TransformOptions,
  transform: ITransformFunc,
  flush: IFlushFunc
) {
  let t2 = new DestroyableTransform(
    Object.assign({ objectMode: true, highWaterMark: 16 }, options)
  );
  t2._transform = transform;

  if (flush) t2._flush = flush;
  return t2;
});

export default through2;
