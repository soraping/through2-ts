import { Transform, TransformOptions } from "stream";
import * as chai from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import * as fs from "fs";
import through2, { obj, ctor } from "../lib";

const should = chai.should();
const assert = chai.assert;
const expect = chai.expect;

chai.use(sinonChai);

describe("transform", () => {
  describe("through2 api", () => {
    it("object through", done => {
      // 设置转换流
      let th2 = through2({ objectMode: true }, function(chunk, enc, callback) {
        // 转换
        this.push({ out: chunk.in + 1 });
        callback();
      });

      let e = 0;

      // 监听转换后的流
      th2.on("data", o => {
        expect(o).to.deep.equal(
          { out: e === 0 ? 102 : e === 1 ? 203 : -99 },
          "got transformed object"
        );
        e++;
      });

      // 创建写入流
      th2.write({ in: 101 });
      th2.write({ in: 202 });
      th2.write({ in: -100 });
      th2.end();

      // 结束
      done();
    });

    it("object through with through2.obj", done => {
      // 设置转换流
      let th2 = obj(function(chunk, enc, callback) {
        // 转换
        this.push({ out: chunk.in + 1 });
        callback();
      });

      let e = 0;

      // 监听转换后的流
      th2.on("data", o => {
        expect(o).to.deep.equal(
          { out: e === 0 ? 102 : e === 1 ? 203 : -99 },
          "got transformed object"
        );
        e++;
      });

      // 创建写入流
      th2.write({ in: 101 });
      th2.write({ in: 202 });
      th2.write({ in: -100 });
      th2.end();

      // 结束
      done();
    });

    it("pipeable through", done => {
      let str = "hello world";
      fs.writeFileSync("./test/data/in.txt", str);
      let th2 = through2(function(chunk, enc, callback) {
        let newString = chunk.toString() + " add string";
        this.push(newString);
        callback();
      });
      fs.createReadStream("./test/data/in.txt")
        .pipe(th2)
        .pipe(fs.createWriteStream("./test/data/out.txt"))
        .on("finish", () => {
          let res = fs.readFileSync("./test/data/out.txt");
          expect(res.toString()).to.be.equal(
            "hello world add string",
            "got transformed string"
          );
          th2.end();
        });
      done();
    });

    it("flush through", done => {
      let th2 = through2(
        function(chunk, enc, callback) {
          this.push(chunk + "world");
          callback();
        },
        function(callback) {
          this.push("hello nodejs");
          callback();
        }
      );
      th2.on("data", o => {
        expect(o.toString()).to.include("hello", "got flush add string");
      });
      th2.write("hello");
      th2.end();
      done();
    });
  });

  describe("through2 ctor api", () => {
    it("through ctor with objectMode", done => {
      let Th2: new () => Transform = ctor({ objectMode: true }, function(
        chunk,
        enc,
        callback
      ) {
        this.push({ out: chunk.in + 1 });
        callback();
      });
      let th2 = new Th2();
      th2.on("data", o => {
        expect(o).to.deep.equal({ out: 13 });
      });
      th2.write({ in: 12 });
      th2.end();
      done();
    });
    it("object through ctor override", done => {
      let Th2: new (opt: TransformOptions) => Transform = ctor(function(
        chunk,
        enc,
        callback
      ) {
        this.push({ out: chunk.in + 1 });
        callback();
      });
      let th2 = new Th2({ objectMode: true });
      th2.on("data", o => {
        expect(o).to.deep.equal({ out: 13 });
      });
      th2.write({ in: 12 });
      th2.end();
      done();
    });
    it("pipeable object through ctor", done => {
      let str = "hello world";
      let filePath = "./test/data/ctor.txt";
      let fileOut = "./test/data/ctor-out.txt";
      fs.writeFileSync(filePath, str);
      let Th2: new () => Transform = ctor(function(chunk, enc, callback) {
        let s = chunk.toString();
        let str = s.replace(/world/g, "node");
        this.push(str);
        callback();
      });
      let th2 = new Th2();
      fs.createReadStream(filePath)
        .pipe(th2)
        .pipe(fs.createWriteStream(fileOut))
        .on("finish", () => {
          let res = fs.readFileSync(fileOut);
          expect(res.toString()).to.be.equal(
            "hello node",
            "got pipeable string"
          );
          th2.end();
        });
      done();
    });
  });

  describe("can be destroyed", () => {
    it("through close destory", done => {
      let th2 = through2(null);
      th2.on("close", () => {
        done();
      });
      th2.destroy();
    });
  });
});
