import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
} from "obsidian";

// ── Settings ──────────────────────────────────────────────────────────────────

interface MagPieSettings {
  apiUrl: string;       // FastAPI backend URL
  defaultFolder: string;
}

const DEFAULT_SETTINGS: MagPieSettings = {
  apiUrl: "http://localhost:8000",
  defaultFolder: "Web Clippings",
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class MagPiePlugin extends Plugin {
  settings: MagPieSettings;

  async onload() {
    await this.loadSettings();

    // ── Ribbon icon ──────────────────────────────────────────────────────────
    this.addRibbonIcon("bird", "MagPie: Crawl URL", () => {
      new CrawlModal(this.app, this.settings).open();
    });

    // ── Command: open crawl dialog ────────────────────────────────────────────
    this.addCommand({
      id: "magpie-crawl-url",
      name: "Crawl a URL into vault",
      callback: () => {
        new CrawlModal(this.app, this.settings).open();
      },
    });

    // ── Command: crawl URL under cursor ───────────────────────────────────────
    this.addCommand({
      id: "magpie-crawl-selection",
      name: "Crawl selected URL",
      editorCallback: (editor: Editor) => {
        const selected = editor.getSelection().trim();
        if (selected.startsWith("http")) {
          new CrawlModal(this.app, this.settings, selected).open();
        } else {
          new Notice("MagPie: Select a URL first");
        }
      },
    });

    // ── Right-click context menu on URLs ──────────────────────────────────────
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection().trim();
        if (selection.startsWith("http")) {
          menu.addItem((item) => {
            item
              .setTitle("🐦‍⬛ Save to vault with MagPie")
              .setIcon("bird")
              .onClick(() => {
                new CrawlModal(this.app, this.settings, selection).open();
              });
          });
        }
      })
    );

    // ── Settings tab ─────────────────────────────────────────────────────────
    this.addSettingTab(new MagPieSettingTab(this.app, this));

    console.log("MagPie loaded");
  }

  onunload() {
    console.log("MagPie unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ── Crawl Modal ───────────────────────────────────────────────────────────────

class CrawlModal extends Modal {
  settings: MagPieSettings;
  prefillUrl: string;

  constructor(app: App, settings: MagPieSettings, prefillUrl = "") {
    super(app);
    this.settings = settings;
    this.prefillUrl = prefillUrl;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🐦‍⬛ MagPie — Crawl URL" });

    // URL input
    const urlInput = contentEl.createEl("input", {
      type: "url",
      placeholder: "https://example.com/article",
      value: this.prefillUrl,
    });
    urlInput.style.cssText = "width:100%;padding:10px;margin:12px 0;font-size:14px;border:1.5px solid #ccc;border-radius:8px;";

    // Folder input
    const folderRow = contentEl.createDiv();
    folderRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:16px;font-size:13px;color:#666;";
    folderRow.createSpan({ text: "Save to:" });
    const folderInput = folderRow.createEl("input", {
      type: "text",
      value: this.settings.defaultFolder,
    });
    folderInput.style.cssText = "flex:1;padding:6px 10px;font-size:13px;border:1.5px solid #ccc;border-radius:6px;";

    // Status area
    const status = contentEl.createDiv();
    status.style.cssText = "min-height:24px;font-size:13px;color:#666;margin-bottom:12px;";

    // Crawl button
    const btn = contentEl.createEl("button", { text: "Crawl & Save" });
    btn.style.cssText = "width:100%;padding:12px;background:#1a6b5a;color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;";

    btn.onclick = async () => {
      const url = urlInput.value.trim();
      if (!url) {
        status.setText("Please enter a URL");
        return;
      }

      btn.disabled = true;
      btn.setText("Crawling…");
      status.setText("⏳ Fetching and processing with Claude…");

      try {
        const response = await requestUrl({
          url: `${this.settings.apiUrl}/crawl`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, folder: folderInput.value.trim() }),
        });

        const data = response.json;
        status.innerHTML = `
          <strong style="color:#1a6b5a">✓ Saved!</strong> 
          <em>${data.title}</em><br>
          <span style="font-family:monospace;font-size:11px;color:#999">📂 ${data.vault_path}</span>
        `;
        btn.setText("Crawl another");
        btn.disabled = false;
        urlInput.value = "";
        new Notice(`MagPie saved: ${data.title}`);
      } catch (e) {
        status.setText(`✗ Error: ${e.message || "Check that MagPie API is running"}`);
        status.style.color = "#c0392b";
        btn.setText("Crawl & Save");
        btn.disabled = false;
      }
    };

    // Focus URL input
    setTimeout(() => urlInput.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

class MagPieSettingTab extends PluginSettingTab {
  plugin: MagPiePlugin;

  constructor(app: App, plugin: MagPiePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "MagPie Settings" });

    new Setting(containerEl)
      .setName("API URL")
      .setDesc("URL of the MagPie FastAPI backend (default: http://localhost:8000)")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:8000")
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default folder")
      .setDesc("Vault folder to save notes into")
      .addText((text) =>
        text
          .setPlaceholder("Web Clippings")
          .setValue(this.plugin.settings.defaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolder = value;
            await this.plugin.saveSettings();
          })
      );
  }
}