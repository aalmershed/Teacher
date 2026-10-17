const { createProjectData } = require('../server/template');
const { renderProject, THEMES, cleanRich } = require('../server/render');
const QRCode = require('qrcode');
window.InjazCore = { createProjectData, renderProject, THEMES, cleanRich, QRCode };
