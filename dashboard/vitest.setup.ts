// happy-dom rejects Animation.finished on cancel without marking it handled, so motion's
// cancelled animations surface as unhandled rejections. Browsers mark that promise handled
// (Web Animations: "cancel an animation"); match them in happy-dom test files.
if (typeof Animation !== "undefined") {
  const cancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function (this: Animation) {
    this.finished.catch(() => undefined);
    cancel.call(this);
  };
}
