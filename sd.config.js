import StyleDictionary from 'style-dictionary';
import { propertyFormatNames } from 'style-dictionary/enums';
import { createPropertyFormatter } from "style-dictionary/utils";
import { readFile } from "fs/promises";
import path from "path";
/*** 常量配置 **/
// 源文件
const SOURCE_PATH = "./src/tokens/core.json";
// 目标目录
const TARGET_DIR = "build/";

const BASE_FONTSIZE = 16;

// 从目标路径读取token文件，用于手动合并
const tokens = JSON.parse(await readFile(SOURCE_PATH, "utf-8"));
const { $themes, $metadata, ...keys } = tokens;
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

        // 生成px
        // rem单位元素的变量
        const remTokens = dictionary.allTokens.filter(token => {
            const value = token.$value ?? token.value;
            return value && typeof(value)==="string" && value.includes("rem");
        }).map(token => {
            const value = token.$value ?? token.value;
            const floatVal = parseFloat(value);
            const pxValue = floatVal === 0 ? 0 : floatVal * BASE_FONTSIZE;
            return `  --${token.name}: ${pxValue}px;`;
        });
        output += `\n/**
 * px单位的变量
 */
.variables-px {
${remTokens.join('\n')}
}\n`;
        return output;
    }
});

async function buildFile(key) {
    const name = key.split("/").pop().toLowerCase();
    const sd = new StyleDictionary({
        // 手动合并tokens
        tokens: tokens[key],
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
                        format: "css/variables-px"
                    }
                ],
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