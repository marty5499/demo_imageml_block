+(function (window, webduino) {

  'use strict';

  window.getVideoClassifier = function (modelName, camSource) {
    return new webduino.module.deeplearn(modelName, camSource);
  };

}(window, window.webduino));