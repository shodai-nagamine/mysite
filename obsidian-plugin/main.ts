import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian';

interface BookshelfSettings {
  apiUrl: string;
  apiToken: string;
  targetFolder: string;
  autoSync: boolean;
  autoSyncInterval: number; // minutes
}

const DEFAULT_SETTINGS: BookshelfSettings = {
  apiUrl: '',
  apiToken: '',
  targetFolder: 'Bookshelf',
  autoSync: false,
  autoSyncInterval: 60,
};

interface SyncFile {
  filename: string;
  book_id: string;
  title: string;
  highlight_count: number;
  markdown: string;
}

interface SyncResponse {
  files: SyncFile[];
  synced_at: string;
}

export default class BookshelfPlugin extends Plugin {
  settings!: BookshelfSettings;
  private autoSyncTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'sync-bookshelf',
      name: 'Sync Bookshelf',
      callback: () => this.runSync(),
    });

    this.addSettingTab(new BookshelfSettingTab(this.app, this));

    if (this.settings.autoSync) {
      this.startAutoSync();
    }
  }

  onunload() {
    this.stopAutoSync();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  startAutoSync() {
    this.stopAutoSync();
    const ms = this.settings.autoSyncInterval * 60 * 1000;
    this.autoSyncTimer = window.setInterval(() => this.runSync(), ms);
  }

  stopAutoSync() {
    if (this.autoSyncTimer !== null) {
      window.clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  async runSync() {
    const { apiUrl, apiToken, targetFolder } = this.settings;
    if (!apiUrl || !apiToken) {
      new Notice('Bookshelf Sync: API URL とトークンを設定してください');
      return;
    }

    new Notice('Bookshelf: 同期中...');

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
    } catch (e) {
      new Notice(`Bookshelf Sync: 接続エラー — ${(e as Error).message}`);
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      new Notice(`Bookshelf Sync: エラー ${response.status} — ${body}`);
      return;
    }

    const data: SyncResponse = await response.json();
    const folder = normalizePath(targetFolder);

    // フォルダが存在しない場合は作成
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    let created = 0;
    let updated = 0;

    for (const file of data.files) {
      const filePath = normalizePath(`${folder}/${file.filename}`);
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, file.markdown);
        updated++;
      } else {
        await this.app.vault.create(filePath, file.markdown);
        created++;
      }
    }

    new Notice(`Bookshelf: 同期完了 — 新規 ${created} 件、更新 ${updated} 件`);
  }
}

class BookshelfSettingTab extends PluginSettingTab {
  plugin: BookshelfPlugin;

  constructor(app: App, plugin: BookshelfPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Bookshelf Sync 設定' });

    new Setting(containerEl)
      .setName('API URL')
      .setDesc('BookshelfアプリのSync APIエンドポイント (例: https://your-app.vercel.app/api/sync)')
      .addText((text) =>
        text
          .setPlaceholder('https://your-app.vercel.app/api/sync')
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('API トークン')
      .setDesc('Bookshelfアプリの設定ページで生成したトークン')
      .addText((text) => {
        text
          .setPlaceholder('貼り付けてください')
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('同期先フォルダ')
      .setDesc('Obsidian Vault 内での保存先フォルダ名')
      .addText((text) =>
        text
          .setPlaceholder('Bookshelf')
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value.trim() || 'Bookshelf';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('自動同期')
      .setDesc('一定間隔で自動的に同期する')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
          if (value) {
            this.plugin.startAutoSync();
          } else {
            this.plugin.stopAutoSync();
          }
        }),
      );

    new Setting(containerEl)
      .setName('自動同期間隔（分）')
      .setDesc('自動同期の実行間隔')
      .addSlider((slider) =>
        slider
          .setLimits(10, 480, 10)
          .setValue(this.plugin.settings.autoSyncInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSyncInterval = value;
            await this.plugin.saveSettings();
            if (this.plugin.settings.autoSync) {
              this.plugin.startAutoSync();
            }
          }),
      );

    new Setting(containerEl)
      .setName('今すぐ同期')
      .setDesc('手動で同期を実行する')
      .addButton((btn) =>
        btn
          .setButtonText('同期')
          .setCta()
          .onClick(() => this.plugin.runSync()),
      );
  }
}
