+(function (factory) {
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
  let vid;
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

  async function start(modelName) {
    // Module.call(this);
    loadJS('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@0.12.5');

    // load models
    try {
      const _mobilenet = await tf.loadModel(HOST_URL + '/mobilenet/v1_0.25_224/model.json');
      const layer = _mobilenet.getLayer('conv_pw_13_relu');
      mobilenet = tf.model({inputs: _mobilenet.inputs, outputs: layer.output});
      secondmodel = await tf.loadModel(HOST_URL + '/ml_models/' + modelName + '/model.json');
    } catch (e) {
      alert('Load model error!');
    }

    // create video element
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

    // create status message
    status = document.createElement('div');
    status.id = 'status';
    document.body.appendChild(status);

    await proto.startDetect();
  }

  function deeplearn(modelName) {
    setTimeout(async ()=>{
      await start(modelName);
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
    setTimeout(async ()=>{await proto.startDetect()}, 100);
  }

  scope.module.deeplearn = deeplearn;
}));