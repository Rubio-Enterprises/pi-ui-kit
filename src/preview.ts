import { type Component, Text, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';

/** What a preview pane shows: plain text, which is wrapped, or a component such as Markdown. */
export type PreviewContent = string | Component;

/** Scroll position of a preview pane. Reset it when the previewed item changes. */
export class PreviewState {
  private offsetIndex = 0;
  private lineCount = 0;
  private visible = 1;

  get offset(): number {
    return this.offsetIndex;
  }

  reset(): void {
    this.offsetIndex = 0;
  }

  scroll(delta: number): void {
    const max = Math.max(0, this.lineCount - this.visible);
    this.offsetIndex = Math.max(0, Math.min(max, this.offsetIndex + delta));
  }

  /** Page size of the last render, for page-wise scrolling. */
  get pageSize(): number {
    return this.visible;
  }

  /** @internal Record the rendered size and clamp the offset. */
  measure(lineCount: number, visible: number): void {
    this.lineCount = lineCount;
    this.visible = Math.max(1, visible);
    this.scroll(0);
  }
}

/**
 * Render `content` scrolled by `state` into at most `height` lines of at most `width` columns.
 * Strings are wrapped at `width`; components render at `width`.
 */
export function renderPreview(
  content: PreviewContent,
  state: PreviewState,
  width: number,
  height: number,
): string[] {
  if (height <= 0) return [];
  const lines =
    typeof content === 'string'
      ? content.split('\n').flatMap((line) => (line ? wrapTextWithAnsi(line, width) : ['']))
      : content.render(width);
  state.measure(lines.length, height);
  return lines
    .slice(state.offset, state.offset + height)
    .map((line) => truncateToWidth(line, width));
}

/** A preview component for plain text that is already styled. */
export function textPreview(text: string): Component {
  return new Text(text, 0, 0);
}
