/* ============================================================
   Central Logger — San Isidro College Reservation System
   Core Layer (js/core/logger.js)
   Tags console output with the MVC layer/module name so errors
   are easy to trace during debugging.
   ============================================================ */

(function () {
  'use strict';

  function formatPrefix(layer) {
    return `[${layer || 'App'}]`;
  }

  const Logger = {
    info(layer, message, ...extra) {
      console.log(formatPrefix(layer), message, ...extra);
    },
    warn(layer, message, ...extra) {
      console.warn(formatPrefix(layer), message, ...extra);
    },
    error(layer, message, ...extra) {
      console.error(formatPrefix(layer), message, ...extra);
    },
    create(layer) {
      return {
        info: (message, ...extra) => Logger.info(layer, message, ...extra),
        warn: (message, ...extra) => Logger.warn(layer, message, ...extra),
        error: (message, ...extra) => Logger.error(layer, message, ...extra)
      };
    }
  };

  window.Logger = Logger;
})();

