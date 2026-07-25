/**
 * BrowserFileAdapter provides file input adapters for browser environments,
 * supporting FileList, DragEvent, and fetch-based file loading.
 */
export class BrowserFileAdapter {
  #lines: string[] = [];

  /**
   * Reads lines from a FileList (e.g., from `<input type="file">`).
   * Each file is read via FileReader and split into non-empty lines.
   */
  static async fromFileList(fileList: FileList): Promise<BrowserFileAdapter> {
    const adapter = new BrowserFileAdapter();
    const allLines: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file) continue;
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      allLines.push(...lines);
    }
    adapter.#lines = allLines;
    return adapter;
  }

  /**
   * Reads lines from a drag-and-drop DragEvent's dataTransfer.files.
   */
  static async fromDragEvent(event: DragEvent): Promise<BrowserFileAdapter> {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      const adapter = new BrowserFileAdapter();
      adapter.#lines = [];
      return adapter;
    }
    return BrowserFileAdapter.fromFileList(files);
  }

  /**
   * Reads lines from a URL via fetch, splitting response text into non-empty lines.
   */
  static async fromFetch(url: string, init?: RequestInit): Promise<BrowserFileAdapter> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const adapter = new BrowserFileAdapter();
    adapter.#lines = lines;
    return adapter;
  }

  /**
   * Returns all parsed lines as an array.
   */
  getLines(): string[] {
    return [...this.#lines];
  }

  /**
   * Returns the total number of lines.
   */
  count(): number {
    return this.#lines.length;
  }
}
