/**
 * Child-frame shim: maps flat pywebview.api.* → parent hub namespace via postMessage.
 * Load before the original tool app.js.
 */
(function (global) {
  "use strict";

  function install(ns) {
    if (!ns) throw new Error("HubApiShim: namespace requis");

    function call(method, args) {
      return new Promise(function (resolve, reject) {
        var id = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        function onMsg(ev) {
          var data = ev.data;
          if (!data || data.type !== "hub-api-result" || data.id !== id) return;
          global.removeEventListener("message", onMsg);
          if (data.ok) resolve(data.res);
          else reject(new Error(data.error || "Erreur API hub"));
        }
        global.addEventListener("message", onMsg);
        if (!global.parent || global.parent === global) {
          reject(new Error("Shim hors iframe hub"));
          return;
        }
        global.parent.postMessage(
          { type: "hub-api-call", id: id, ns: ns, method: method, args: args || [] },
          "*"
        );
      });
    }

    var api = new Proxy(
      {},
      {
        get: function (_t, prop) {
          if (prop === "then" || prop === "toJSON") return undefined;
          if (typeof prop !== "string") return undefined;
          return function () {
            var args = Array.prototype.slice.call(arguments);
            return call(prop, args);
          };
        },
      }
    );

    global.pywebview = global.pywebview || {};
    global.pywebview.api = api;

    global.addEventListener("message", function (ev) {
      var data = ev.data;
      if (!data || data.type !== "hub-seg") return;
      try {
        var btn = document.querySelector('.nav-btn[data-page="' + data.id + '"]');
        if (btn) btn.click();
      } catch (_) {}
    });

    document.documentElement.classList.add("pcd-embed", "hub-inframe");
    if (document.body) document.body.classList.add("pcd-embed", "hub-inframe");
    else {
      document.addEventListener("DOMContentLoaded", function () {
        if (document.body) document.body.classList.add("pcd-embed", "hub-inframe");
      });
    }
  }

  global.HubApiShim = { install: install };
})(window);
