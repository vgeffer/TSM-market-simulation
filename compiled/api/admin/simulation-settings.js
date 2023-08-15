"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
class SimStettings {
    constructor(defaultSettingsPath = "./simsettings.json") {
        this.settingsobj = {};
        const settings = (0, fs_1.readFileSync)(defaultSettingsPath, { encoding: 'utf-8' });
    }
    save_settings() {
    }
}
exports.default = SimStettings;
;
