class Camera {
  constructor(idx) {
    this.cameraList = [];
    this.remote = typeof idx == "string";
    if (this.remote) {
      this.idx = -1;
      this.url = idx;
    } else {
      this.idx = arguments.length == 0 ? 0 : parseInt(idx);
    }
  }

  list(cb) {
    var self = this;
    navigator.mediaDevices.enumerateDevices()
      .then(function (o) {
        self.gotDevices(self, o);
        cb(self.cameraList);
      }).catch(self.handleError);
  }

  async init() {
    if (this.idx == -1) return;
    var self = this;
    return new Promise(function (resolve, reject) {
      navigator.mediaDevices.enumerateDevices()
        .then(function (o) {
          self.gotDevices(self, o);
          resolve();
        }).catch(self.handleError);
    });
  }

  gotDevices(self, deviceInfos) {
    for (var i = 0; i !== deviceInfos.length; ++i) {
      var deviceInfo = deviceInfos[i];
      if (deviceInfo.kind === 'videoinput') {
        self.cameraList.push(deviceInfo);
      }
    }
  }

  async start() {
    await this.init();
    if (this.idx == -1) return;
    if (window.stream) {
      window.stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
    var deviceId = 0;
    try {
      deviceId = this.cameraList[this.idx].deviceId;
    } catch (e) {
      console.log("can't found idx:", this.idx, "error:", e);
      console.log(this.cameraList);
    }
    var constraints = {
      video: {
        deviceId: { exact: deviceId }
      }
    };
    var self = this;
    navigator.mediaDevices.getUserMedia(constraints).
    then(function (stream) {
      if (self.stream) {
        self.stream(stream);
      }
    }).catch(this.handleError);
  }

  onStream(stream) {
    this.stream = stream;
  }

  handleError(error) {
    console.log('Error: ', error);
  }

  toVideo(eleId) {
    this.start();
    if (eleId.charAt(0) == '#') {
      eleId = eleId.substring(1);
    }
    if (this.remote) {
      if (this.remote.indexOf("ws://") == 0) {
        if (window.WebSocket) {
          var video = document.getElementById(eleId);
          this.remoteVideo = video;
          ConnectWebSocket(this.url);
        }
      } else if (this.remote.indexOf("http://") == 0) {
        console.log("ESP32 Camera");
      }
    } else {
      var ele = document.getElementById(eleId);
      this.onStream(function (stream) {
        ele.srcObject = stream;
      });
    }
  }

  drawRotated(canvas, image, degrees) {
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(degrees * Math.PI / 180);
    context.drawImage(image, -image.width / 2, -image.width / 2);
    context.restore();
  }

  onCanvas(canvasId, callback) {
    this.start();
    var canvas = typeof canvasId === 'object' ?
      canvasId : document.getElementById(canvasId);
    var video;
    if (this.remote && this.url.indexOf("ws://") == 0) {
      video = document.createElement('video');
      video.autoplay = true;
      if (window.WebSocket) {
        this.remoteVideo = video;
        ConnectWebSocket(this.url);
        video.onloadeddata = function () {
          var loop = function () {
            canvas.getContext('2d').drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
              0, 0, canvas.width, canvas.height);
            if (typeof callback == 'function')
              callback(canvas);
            requestAnimationFrame(loop);
          }
          requestAnimationFrame(loop);
        }
      }
    } else if (this.remote && this.url.indexOf("http://") == 0) {
      var self = this;
      var espCamImg = document.createElement('img');
      espCamImg.width = 224;
      espCamImg.height = 224;
      espCamImg.setAttribute("crossOrigin", 'Anonymous');
      var camSnapshotDelay = 0.5;
      var param = this.url.indexOf("?");
      if (param > 0) {
        camSnapshotDelay = parseFloat(this.url.substring(param + 1)) * 1000;
        this.url = this.url.substring(0, param);
      }
      espCamImg.src = this.url;
      var ctx = canvas.getContext('2d');
      espCamImg.onload = function () {
        self.drawRotated(canvas, espCamImg, 90);
        if (typeof callback == 'function') {
          callback(canvas);
        }
        setTimeout(function () {
          espCamImg.src = self.url + "?" + Math.random();
        }, camSnapshotDelay);
      }
    } else {
      this.onStream(function (stream) {
        video.srcObject = stream;
        var loop = function () {
          canvas.getContext('2d').drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
            0, 0, canvas.width, canvas.height);
          if (typeof callback == 'function')
            callback(canvas);
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      });
    }
  }
}


+
(function (factory) {
  if (typeof exports === 'undefined') {
    factory(webduino || {});
  } else {
    module.exports = factory;
  }
}(function (scope) {
  'use strict';
  // let self = this;
  let proto;
  let Module = scope.Module;
  const HOST_URL = 'https://mldemo.webduino.io';
  let mobilenet;
  let secondmodel;
  let vid = 0;
  let status;
  let labels = [];

  function loadJS(filePath) {
    var req = new XMLHttpRequest();
    req.open("GET", filePath, false); // 'false': synchronous.
    req.send(null);
    var headElement = document.getElementsByTagName("head")[0];
    var newScriptElement = document.createElement("script");
    newScriptElement.type = "text/javascript";
    newScriptElement.text = req.responseText;
    headElement.appendChild(newScriptElement);
  }

  async function start(modelName, camSource) {
    console.log("tfjs 0.13.4");
    //camSource = "http://192.168.0.168/jpg?0.5";
    // Module.call(this);
    loadJS('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@0.13.4');
    // load models
    try {
      const _mobilenet = await tf.loadModel(HOST_URL + '/mobilenet/v1_0.25_224/model.json');
      const layer = _mobilenet.getLayer('conv_pw_13_relu');
      mobilenet = tf.model({ inputs: _mobilenet.inputs, outputs: layer.output });
      secondmodel = await tf.loadModel(HOST_URL + '/ml_models/' + modelName + '/model.json');
    } catch (e) {
      alert('Load model error!');
    }
    if (camSource != '本機') {
      var c1 = document.createElement('canvas');
      c1.width = 224;
      c1.height = 224;
      document.body.appendChild(c1);
      new Camera(camSource).onCanvas(c1, function (c) {
        vid = c.getContext('2d').getImageData(0, 0, 224, 224);
      });
    } else {
      vid = document.createElement('video');
      vid.width = 224;
      vid.height = 224;
      vid.autoplay = true;
      document.body.appendChild(vid);
      // start webcam
      try {
        navigator.mediaDevices.getUserMedia({
            video: {
              width: 224,
              height: 224,
              facingMode: "environment"
            }
          })
          .then(stream => {
            vid.srcObject = stream;
            vid.play();
          });
      } catch (e) {
        alert('WebCam is not available!');
      }
    }

    // create status message
    status = document.createElement('div');
    status.id = 'status';
    document.body.appendChild(status);

    await proto.startDetect();
  }

  function deeplearn(modelName, camSource) {
    setTimeout(async () => {
      await start(modelName, camSource);
    }, 1);
  }

  deeplearn.prototype = proto =
    Object.create(Module.prototype, {
      constructor: {
        value: deeplearn
      }
    });

  proto.onLabel = function (idx, callback) {
    labels[idx] = callback;
  }

  proto.startDetect = async function () {
    if (vid != 0) {
      const resultTensor = tf.tidy(() => {
        const webcamImage = tf.fromPixels(vid);
        const batchedImage = webcamImage.expandDims(0);
        const img = batchedImage.toFloat().div(tf.scalar(127)).sub(tf.scalar(1));
        const activation = mobilenet.predict(img).flatten().expandDims(0);
        const predictions = secondmodel.predict(activation);
        return predictions.as1D();
      });
      let classTensor = resultTensor.argMax();
      let confidenceTensor = resultTensor.max();
      let result = {
        class: (await classTensor.data())[0],
        confidence: (await confidenceTensor.data())[0]
      }
      classTensor.dispose();
      confidenceTensor.dispose();
      resultTensor.dispose();
      status.innerHTML = "辨識類別編號為：" + result.class + ",信心水準：" + parseInt(result.confidence * 1000000) / 10000.0 + " %";
      if (typeof labels[result.class] === "function") {
        labels[result.class](result.class);
      }
    }
    setTimeout(async () => { await proto.startDetect() }, 100);
  }

  scope.module.deeplearn = deeplearn;
}));