import typescript from 'rollup-plugin-typescript';
import html from 'rollup-plugin-html';
import scss from 'rollup-plugin-scss';
import packageJson from './package.json';

const userScriptBanner = `
// ==UserScript==
// @name         ${packageJson.name}
// @namespace    iilj
// @version      ${packageJson.version}
// @description  ${packageJson.description}
// @author       ${packageJson.author}
// @license      ${packageJson.license}
// @supportURL   ${packageJson.bugs.url}
// @match        https://atcoder.jp/*standings*
// @exclude      https://atcoder.jp/*standings/json
// @resource     loaders.min.css https://cdnjs.cloudflare.com/ajax/libs/loaders.css/0.1.2/loaders.min.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==`.trim();

export default [
    {
        input: 'src/main.ts',
        output: {
            banner: userScriptBanner,
            file: 'dist/dist.js',
        },
        plugins: [
            html({
                include: '**/*.html',
            }),
            scss({
                output: false,
            }),
            typescript(),
        ],
    },
];
