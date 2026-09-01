import { Fragment, type ReactNode } from "react";

/**
 * Turns the specific lightweight-markdown patterns lib/rag.ts's system
 * prompt asks the model to produce (paragraphs, "* "/"- " and "1. "
 * lists, **bold**) into real DOM elements, without a markdown
 * dependency or dangerouslySetInnerHTML -- content can be model output
 * (untrusted per docs/security.md), so nodes are built directly.
 */
export function renderWidgetMarkdown(content: string): ReactNode {
  const blocks = content.split(/\n{2,}/);

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter((line) => line.trim() !== "");
        if (lines.length === 0) return null;

        const bulletLines = lines.every((line) => /^[*-]\s+/.test(line));
        if (bulletLines) {
          return (
            <ul key={blockIndex} className="my-1 list-disc space-y-0.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^[*-]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        const numberedLines = lines.every((line) => /^\d+\.\s+/.test(line));
        if (numberedLines) {
          return (
            <ol key={blockIndex} className="my-1 list-decimal space-y-0.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }

        return (
          <p key={blockIndex} className={blockIndex > 0 ? "mt-1.5" : undefined}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*.+?\*\*)/g).filter((part) => part !== "");
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
