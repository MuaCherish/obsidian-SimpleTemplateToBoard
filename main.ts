import {
  App,
  Editor,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TextAreaComponent,
  TextComponent,
} from "obsidian";

// 桌面端通过 Electron 读写剪贴板时使用（打包后由 Obsidian 运行时提供 require）。
declare const require: (name: string) => any;

// ==================== 类型与默认设置 ====================

interface Template {
  id: string;
  name: string;
  template: string;
}

interface TemplateClipboardSettings {
  templates: Template[];
  deleteSelection: boolean;
}

const DEFAULT_SETTINGS: TemplateClipboardSettings = {
  templates: [],
  deleteSelection: true,
};

// 示例模板（与验收示例的输出一致，注意 %1 与 %2 之间不加逗号）
const EXAMPLE_TEMPLATE = `<input>
- %1 and %2
</input>

<output>
Please deep think, %1 and %2
<\\n>===
</output>`;

// ==================== 模板引擎（纯函数） ====================

interface ParsedPattern {
  regex: RegExp;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 解析模板，拆分为输入模式与输出格式。
 * - <input>…</input>：输入模式。可用 %1、%2… 占位符（简单模式，字面量自动转义），
 *   也可直接写正则捕获组 (…)（正则模式，自动识别）。
 * - <output>…</output>：输出格式。%1、%2… 引用对应捕获组；<\\n> 表示换行。
 * 输出格式中的普通换行与 <\\n> 都表示换行，连续多个换行会合并为一个。
 */
function parseTemplate(
  source: string
): { inputPattern: string; outputFormat: string } | null {
  const inputMatch = source.match(/<input>([\s\S]*?)<\/input>/);
  const outputMatch = source.match(/<output>([\s\S]*?)<\/output>/);
  if (!inputMatch || !outputMatch) return null;
  return {
    inputPattern: inputMatch[1].replace(/[\r\n]+/g, "").trim(),
    outputFormat: normalizeOutputFormat(outputMatch[1]),
  };
}

/** 将输出格式里的普通换行与 <\\n> 统一为单个换行。 */
function normalizeOutputFormat(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n") // 统一换行符
    .replace(/<\\n>/g, "\n") // 显式换行标记
    .replace(/\n{2,}/g, "\n") // 合并连续换行
    .trim();
}

/**
 * 将输入模式编译为正则。
 * - 简单模式（含 %N）：%N 编译为惰性捕获组 (.*?)，其余文本按字面转义。
 * - 正则模式（不含 %N）：把整个输入模式当作正则表达式直接使用。
 * 两种模式下捕获组都按出现顺序编号，输出里用 %1、%2… 引用。
 */
function parsePattern(pattern: string): ParsedPattern {
  if (/%\d/.test(pattern)) {
    let reStr = "";
    for (const token of pattern.split(/(%\d+)/)) {
      if (token === "") continue;
      if (/^%\d+$/.test(token)) {
        reStr += "(.*?)";
      } else {
        reStr += escapeRegExp(token);
      }
    }
    return { regex: new RegExp("^" + reStr + "$") };
  }
  try {
    return { regex: new RegExp("^" + pattern + "$") };
  } catch (e) {
    throw new Error("正则表达式无效：" + (e as Error).message);
  }
}

function renderOutput(format: string, captures: string[]): string {
  return format.replace(/%(\d+)/g, (whole, numStr: string) => {
    const n = parseInt(numStr, 10);
    return n >= 1 && n <= captures.length ? captures[n - 1] : whole;
  });
}

export interface TransformResult {
  ok: boolean;
  result: string;
  error?: string;
}

/**
 * 将 input 中的每一行按模板转换，并把所有结果用换行拼接。
 * 匹配失败的行原样保留；空行跳过。
 */
export function applyTemplate(
  source: string,
  input: string
): TransformResult {
  const parsed = parseTemplate(source);
  if (!parsed) {
    return { ok: false, result: "", error: "模板必须包含 <input> 与 <output> 区块" };
  }
  if (!parsed.inputPattern) {
    return { ok: false, result: "", error: "<input> 区块不能为空" };
  }

  let pattern: ParsedPattern;
  try {
    pattern = parsePattern(parsed.inputPattern);
  } catch (e) {
    return { ok: false, result: "", error: (e as Error).message };
  }

  const results: string[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    const m = pattern.regex.exec(line);
    if (m) {
      results.push(renderOutput(parsed.outputFormat, m.slice(1)));
    } else {
      results.push(line);
    }
  }
  return { ok: true, result: results.join("\n") };
}

// ==================== 插件主体 ====================

/** 尝试获取 Electron 剪贴板（桌面端更可靠），非桌面环境返回 null。 */
function getElectronClipboard(): {
  readText(): string;
  writeText(text: string): void;
} | null {
  try {
    const electron = require("electron");
    if (electron && electron.clipboard) return electron.clipboard;
  } catch (e) {
    // 非桌面环境或 require 不可用
  }
  return null;
}

export default class TemplateClipboardPlugin extends Plugin {
  settings: TemplateClipboardSettings;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("wand-2", "简单模板转换到粘贴板：配置模板", () =>
      this.openSettingsTab()
    );

    this.addSettingTab(new TemplateClipboardSettingTab(this.app, this));

    this.addCommand({
      id: "apply-template",
      name: "应用模板转换",
      editorCallback: (editor: Editor) => this.pickAndApply(editor),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        const templates = this.settings.templates;
        if (!templates.length) return;
        menu.addItem((item) => {
          item.setTitle("模板转换").setIcon("clipboard-copy");

          // 新版 Obsidian 支持子菜单（setSubmenu）；不支持时退化为点击后弹窗选择。
          const submenu = (
            item as unknown as { setSubmenu?: () => Menu }
          ).setSubmenu?.();

          if (submenu) {
            for (const t of templates) {
              submenu.addItem((sub) =>
                sub.setTitle(t.name).onClick(() => this.applyWithSource(editor, t))
              );
            }
          } else {
            item.onClick(() => this.pickAndApply(editor));
          }
        });
      })
    );
  }

  onunload() {}

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // 兼容旧版本字段名：replaceSelection → deleteSelection
    if (data && typeof data.replaceSelection === "boolean") {
      this.settings.deleteSelection = data.replaceSelection;
    }
    if (!Array.isArray(this.settings.templates)) this.settings.templates = [];
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  openSettingsTab() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = this.app as any;
    if (app.setting?.open) {
      app.setting.open();
      app.setting.openTabById(this.manifest.id);
    } else {
      new Notice("请在「设置 → 第三方插件 → 简单模板转换到粘贴板」中配置模板");
    }
  }

  pickAndApply(editor: Editor) {
    const templates = this.settings.templates;
    if (!templates.length) {
      new Notice("尚未配置任何模板，请先点击左侧图标添加");
      return;
    }
    new TemplatePickerModal(this.app, templates, (t) =>
      this.applyWithSource(editor, t)
    ).open();
  }

  async applyWithSource(editor: Editor, template: Template) {
    let input = editor.getSelection();
    const fromSelection = input.length > 0;
    if (!fromSelection) input = await this.readClipboard();

    if (!input) {
      new Notice("没有可处理的数据：请先选中文本或复制内容");
      return;
    }

    const res = applyTemplate(template.template, input);
    if (!res.ok) {
      new Notice(`模板「${template.name}」转换失败：${res.error}`);
      return;
    }

    const copied = await this.writeClipboard(res.result);
    if (fromSelection && this.settings.deleteSelection) {
      editor.replaceSelection("");
    }
    if (copied) new Notice(`已按「${template.name}」转换并复制到剪贴板`);
  }

  async readClipboard(): Promise<string> {
    const ec = getElectronClipboard();
    if (ec) {
      try {
        return ec.readText();
      } catch (e) {
        // 读取失败则退回 Web API
      }
    }
    try {
      if (navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
      }
    } catch (e) {
      // 读取剪贴板失败时静默返回空串
    }
    return "";
  }

  async writeClipboard(text: string): Promise<boolean> {
    const ec = getElectronClipboard();
    if (ec) {
      try {
        ec.writeText(text);
        return true;
      } catch (e) {
        // 写入失败则退回 Web API
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      new Notice("复制到剪贴板失败，请检查系统剪贴板权限");
      return false;
    }
  }
}

// ==================== 模板选择弹窗 ====================

class TemplatePickerModal extends Modal {
  private templates: Template[];
  private onPick: (t: Template) => void;

  constructor(app: App, templates: Template[], onPick: (t: Template) => void) {
    super(app);
    this.templates = templates;
    this.onPick = onPick;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "选择模板" });
    for (const t of this.templates) {
      new Setting(contentEl)
        .setName(t.name)
        .addButton((btn) =>
          btn
            .setButtonText("应用")
            .setCta()
            .onClick(() => {
              this.onPick(t);
              this.close();
            })
        );
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== 模板编辑弹窗 ====================

class TemplateEditModal extends Modal {
  private plugin: TemplateClipboardPlugin;
  private template: Template;
  private onSaved?: () => void;

  constructor(
    app: App,
    plugin: TemplateClipboardPlugin,
    template: Template,
    onSaved?: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.template = template;
    this.onSaved = onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "编辑模板" });

    let name = this.template.name;
    let source = this.template.template;

    new Setting(contentEl)
      .setName("模板名称")
      .setDesc("将显示在右键菜单中")
      .addText((text: TextComponent) => {
        text.setValue(name);
        text.onChange((v) => (name = v));
      });

    new Setting(contentEl)
      .setName("模板内容")
      .setDesc(
        "用 <input> 定义输入模式，<output> 定义输出格式。%1、%2… 为占位符（简单模式），也可在 <input> 里直接写正则捕获组 (…)（正则模式，自动识别）；<\\n> 表示换行。"
      )
      .addTextArea((ta: TextAreaComponent) => {
        ta.setValue(source);
        ta.inputEl.rows = 12;
        ta.inputEl.style.width = "100%";
        ta.inputEl.style.fontFamily = "monospace";
        ta.onChange((v) => (source = v));
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("保存")
        .setCta()
        .onClick(async () => {
          this.template.name = name;
          this.template.template = source;
          await this.plugin.saveSettings();
          this.close();
          new Notice("模板已保存");
          this.onSaved?.();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== 模板测试弹窗 ====================

class TemplateTestModal extends Modal {
  private template: Template;

  constructor(app: App, template: Template) {
    super(app);
    this.template = template;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `测试模板：${this.template.name}` });

    let inputArea!: TextAreaComponent;
    new Setting(contentEl)
      .setName("输入数据")
      .setDesc("每行一条数据，例如：- apple, and banana")
      .addTextArea((ta) => {
        inputArea = ta;
        ta.setPlaceholder("- apple, and banana\n- banana, and fish");
        ta.inputEl.rows = 8;
        ta.inputEl.style.width = "100%";
        ta.inputEl.style.fontFamily = "monospace";
      });

    const outputEl = contentEl.createEl("pre");
    outputEl.style.background = "var(--background-secondary)";
    outputEl.style.padding = "10px";
    outputEl.style.borderRadius = "6px";
    outputEl.style.whiteSpace = "pre-wrap";
    outputEl.style.wordBreak = "break-all";
    outputEl.setText("（转换结果将显示在这里）");

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("转换")
          .setCta()
          .onClick(() => {
            const res = applyTemplate(this.template.template, inputArea.getValue());
            if (res.ok) outputEl.setText(res.result || "（空输出）");
            else outputEl.setText("错误：" + res.error);
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("复制结果")
          .onClick(async () => {
            const res = applyTemplate(this.template.template, inputArea.getValue());
            if (!res.ok) {
              new Notice("错误：" + res.error);
              return;
            }
            await navigator.clipboard.writeText(res.result);
            new Notice("结果已复制到剪贴板");
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== 设置面板 ====================

class TemplateClipboardSettingTab extends PluginSettingTab {
  plugin: TemplateClipboardPlugin;

  constructor(app: App, plugin: TemplateClipboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("简单模板转换到粘贴板").setHeading();

    new Setting(containerEl)
      .setName("转换后删除原选区")
      .setDesc(
        "开启：右键应用模板时，删除选中的原文本，转换结果仅复制到剪贴板。关闭：只复制到剪贴板，不改动原文本。"
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.deleteSelection).onChange(async (v) => {
          this.plugin.settings.deleteSelection = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("模板列表").setHeading();

    const templates = this.plugin.settings.templates;
    if (!templates.length) {
      containerEl.createEl("p", {
        text: "还没有模板。点击下方「新建模板」开始。",
      });
    }

    templates.forEach((t, index) => {
      const row = new Setting(containerEl);
      row.setName(t.name);
      row.setDesc(this.summarize(t.template));

      row.addButton((btn) =>
        btn.setButtonText("编辑").onClick(() => {
          new TemplateEditModal(this.app, this.plugin, t, () => this.display()).open();
        })
      );
      row.addButton((btn) =>
        btn.setButtonText("测试").onClick(() => {
          new TemplateTestModal(this.app, t).open();
        })
      );
      row.addButton((btn) =>
        btn
          .setButtonText("删除")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.templates.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          })
      );
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("新建模板")
        .setCta()
        .onClick(async () => {
          const t: Template = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: "新模板",
            template: EXAMPLE_TEMPLATE,
          };
          this.plugin.settings.templates.push(t);
          await this.plugin.saveSettings();
          this.display();
          new TemplateEditModal(this.app, this.plugin, t, () => this.display()).open();
        })
    );
  }

  private summarize(source: string): string {
    const m = source.match(/<input>([\s\S]*?)<\/input>/);
    if (!m) return "（缺少 <input> 区块）";
    const p = m[1].replace(/[\r\n]+/g, "").trim();
    return "输入模式：" + (p || "（空）");
  }
}
