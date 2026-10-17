const { createProjectData, applyAccountName } = require('../server/template');
const { renderProject, THEMES, cleanRich } = require('../server/render');
const QRCode = require('qrcode');
window.InjazCore = { createProjectData, applyAccountName, renderProject, THEMES, cleanRich, QRCode };
