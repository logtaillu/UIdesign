import StyleDictionary from 'style-dictionary';
import { propertyFormatNames } from 'style-dictionary/enums';
import { createPropertyFormatter } from "style-dictionary/utils";
import { readFile } from "fs/promises";
import path from "path";
/*** 常量配置 **/
// 源文件
const SOURCE_PATH = "./src/tokens/core.json";
const TEXT_PATH = "./src/tokens/字符串变量/Mode 1.json"
// 目标目录
const TARGET_DIR = "build/";

// rem基准字体大小
const BASE_FONTSIZE = 16;
// rpx基准屏幕大小
const BASE_SCREEN_SIZE = 375;
async function readFileIfExist(path) {
    try {
        return JSON.parse(await readFile(path, "utf-8"));
    } catch (error) {
        return {};
    }
}
// 从目标路径读取token文件，用于手动合并
const tokens = await readFileIfExist(SOURCE_PATH);
const { $themes, $metadata, ...keys } = tokens;
const text = await readFileIfExist(TEXT_PATH);
Object.keys(text).forEach(key => {
    text[key].$value = text[key].value;
    text[key].$type = text[key].type;
});
// 转成px单位用于之后统一计算
function transUnitToPx(value, unit) {
    if (unit === 'px') {
        return value;
    } else if (unit === 'rem') {
        return value * BASE_FONTSIZE;
    } else if (unit === 'rpx') {
        return value * BASE_SCREEN_SIZE / 750;
    }
}

// 单位转换
function transUnit(sourceValue, targetUnit) {
    const floatVal = parseFloat(sourceValue);
    const sourceUnit = sourceValue.match(/[\d.]+(rem|px)/)[1];
    if (floatVal === 0) {
        return `0${targetUnit}`;
    }
    const pxValue = transUnitToPx(floatVal, sourceUnit);
    if (targetUnit === 'px') {
        // px->px
        return `${pxValue}${targetUnit}`;
    } else if (targetUnit === 'rem') {
        // px->rem
        return `${pxValue / BASE_FONTSIZE}${targetUnit}`;
    } else if (targetUnit === 'rpx') {
        // px->rpx
        return `${pxValue * 750 / BASE_SCREEN_SIZE}${targetUnit}`;
    }
}
StyleDictionary.registerFormat({
    name: 'css/variables-px',
    format: function ({ dictionary, options }) {
        const { outputReferences } = options;
        const formatProperty = createPropertyFormatter({
            outputReferences,
            dictionary,
            format: propertyFormatNames.css,
            usesDtcg: true
        });
        const tokens = dictionary.allTokens.map(formatProperty);
        let output = `\
/**
 * Do not edit directly, this file was auto-generated.
 */

:root {
  font-size: ${BASE_FONTSIZE}px;
${tokens.join('\n')}
}\n`;
        // 生成单位转换类
        ["px", "rem", "rpx"].forEach(unit => {
            const sizeTokens = dictionary.allTokens.filter(token => {
                const value = token.$value ?? token.value;
                return value && typeof (value) === "string" && value.match(/^[\d.]+(rem|px)$/);
            }).map(token => {
                const value = token.$value ?? token.value;
                const transedValue = transUnit(value, unit);
                return transedValue === '' ? '' : `  --${token.name}: ${transedValue};`;
            }).filter(v => v !== '');
            output += `\n/**
 * ${unit}单位的变量
 */
.variables-${unit} {
${sizeTokens.join('\n')}
}\n`;
        });
        return output;
    }
});

async function buildFile(key) {
    const name = key.split("/").pop().toLowerCase();
    const sd = new StyleDictionary({
        // 手动合并tokens
        tokens: { ...tokens[key], text },
        platforms: {
            css: {
                // 参见https://styledictionary.com/reference/hooks/transform-groups/predefined/
                transformGroup: "css",
                // 输出目录
                buildPath: path.resolve(TARGET_DIR, name),
                // 输出文件
                files: [
                    {
                        destination: 'variables.css',
                        format: "css/variables-px",
                        filter: (token) => {
                            return (token.type || token.$type) !== 'text';
                        }
                    }
                ],
            },
            js: {
                transformGroup: 'js',
                buildPath: path.resolve(TARGET_DIR, name),
                files: [{
                    destination: 'tokens.js',
                    format: 'javascript/es6',
                    filter: (token) => {
                        return (token.type || token.$type) == 'text';
                    }
                }]
            }
        }
    });

    await sd.cleanAllPlatforms();
    await sd.buildAllPlatforms();
}
async function run() {
    try {
        await Promise.all(
            Object.keys(keys).map(async (key) => {
                await buildFile(key);
            })
        );
        process.exit(0);
    } catch (error) {
        console.error('执行失败:', error);
        process.exit(1);
    }
}
run().catch(err => {
    console.error('未捕获的异常:', err);
    process.exit(1);
});