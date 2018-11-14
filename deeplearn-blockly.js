+(function (window, webduino) {

  'use strict';

  window.getVideoClassifier = function (modelName) {
    return new webduino.module.deeplearn(modelName);
  };
  
}(window, window.webduino));