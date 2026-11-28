/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; js-indent-level: 2; fill-column: 100 -*- */
// SPDX-License-Identifier: MIT

// Debugging note:
// Switch the web worker in the browsers debug tab to debug this code.
// It's the "em-pthread" web worker with the most memory usage, where "zetajs" is defined.

// JS mode: module
import {
  ZetaHelperThread
} from './zetaHelper.js';

// global variables - zetajs environment:
const zHT = new ZetaHelperThread();
const zetajs = zHT.zetajs;
const css = zHT.css;

// = global variables (some are global for easier debugging) =
// common variables:
let xModel;
// example specific:
let bean_hidden, bean_overwrite, bean_pdf_export, from, to;

// Export variables for debugging. Available for debugging via:
//   globalThis.zetajsStore.threadJsContext
export {
  zHT,
  xModel,
  bean_hidden,
  bean_overwrite,
  bean_pdf_export,
  from,
  to
};

function demo() {
  bean_hidden = new css.beans.PropertyValue({
    Name: 'Hidden',
    Value: true
  });
  bean_overwrite = new css.beans.PropertyValue({
    Name: 'Overwrite',
    Value: true
  });
  bean_pdf_export = new css.beans.PropertyValue({
    Name: 'FilterName',
    Value: 'writer_pdf_Export'
  });

  zHT.thrPort.onmessage = (e) => {
    switch (e.data.cmd) {
      case 'convert':
        try {
          // Close old document in advance. Keep document open afterwards for debugging.
          if (xModel !== undefined &&
            xModel.queryInterface(zetajs.type.interface(css.util.XCloseable))) {
            xModel.close(false);
          }
          from = e.data.from;
          to = e.data.to;
          xModel = zHT.desktop.loadComponentFromURL('file://' + from, '_blank', 0, [bean_hidden,new css.beans.PropertyValue({Name:'MacroExecutionMode',Value:0}),new css.beans.PropertyValue({Name:'UpdateDocMode',Value:0}),new css.beans.PropertyValue({Name:'ReadOnly',Value:true})]);
          const filter=xModel.supportsService('com.sun.star.sheet.SpreadsheetDocument')?'calc_pdf_Export':'writer_pdf_Export';
          xModel.storeToURL('file://' + to, [bean_overwrite,new css.beans.PropertyValue({Name:'FilterName',Value:filter})]);
          zetajs.mainPort.postMessage({
            cmd: 'converted',
            name: e.data.name,
            from,
            to
          });
        } catch (e) {
          const exc = zetajs.catchUnoException(e);
          zetajs.mainPort.postMessage({cmd:'failed',message:'The Office engine could not convert this document.'});
        }
        break;
      default:
        throw Error('Unknown message command: ' + e.data.cmd);
    }
  }

  zHT.thrPort.postMessage({
    cmd: 'start'
  });
}

demo(); // launching demo

/* vim:set shiftwidth=2 softtabstop=2 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */