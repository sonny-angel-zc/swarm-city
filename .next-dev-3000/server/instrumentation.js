"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "instrumentation";
exports.ids = ["instrumentation"];
exports.modules = {

/***/ "(instrument)/./instrumentation.ts":
/*!****************************!*\
  !*** ./instrumentation.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\nasync function register() {\n    if (false) {}\n    const adapter = await __webpack_require__.e(/*! import() */ \"_instrument_src_core_codexAdapter_ts\").then(__webpack_require__.bind(__webpack_require__, /*! @/core/codexAdapter */ \"(instrument)/./src/core/codexAdapter.ts\"));\n    adapter.applyCodexAgentIdFromConfig();\n    adapter.warnIfCodexAgentMappingMissing();\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vaW5zdHJ1bWVudGF0aW9uLnRzIiwibWFwcGluZ3MiOiI7Ozs7QUFBTyxlQUFlQTtJQUNwQixJQUFJQyxLQUFxQyxFQUFFLEVBQU87SUFDbEQsTUFBTUcsVUFBVSxNQUFNLHVNQUE2QjtJQUNuREEsUUFBUUMsMkJBQTJCO0lBQ25DRCxRQUFRRSw4QkFBOEI7QUFDeEMiLCJzb3VyY2VzIjpbIi9Vc2Vycy9zb25ueV9hbmdlbC8ub3BlbmNsYXcvd29ya3NwYWNlL3N3YXJtLWNpdHkvaW5zdHJ1bWVudGF0aW9uLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5FWFRfUlVOVElNRSAhPT0gJ25vZGVqcycpIHJldHVybjtcbiAgY29uc3QgYWRhcHRlciA9IGF3YWl0IGltcG9ydCgnQC9jb3JlL2NvZGV4QWRhcHRlcicpO1xuICBhZGFwdGVyLmFwcGx5Q29kZXhBZ2VudElkRnJvbUNvbmZpZygpO1xuICBhZGFwdGVyLndhcm5JZkNvZGV4QWdlbnRNYXBwaW5nTWlzc2luZygpO1xufVxuIl0sIm5hbWVzIjpbInJlZ2lzdGVyIiwicHJvY2VzcyIsImVudiIsIk5FWFRfUlVOVElNRSIsImFkYXB0ZXIiLCJhcHBseUNvZGV4QWdlbnRJZEZyb21Db25maWciLCJ3YXJuSWZDb2RleEFnZW50TWFwcGluZ01pc3NpbmciXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(instrument)/./instrumentation.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__("(instrument)/./instrumentation.ts"));
module.exports = __webpack_exports__;

})();