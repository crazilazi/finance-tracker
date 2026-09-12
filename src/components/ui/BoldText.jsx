import React from 'react';

/**
 * Renders text containing **bold** markers as React elements.
 * Replaces the previous dangerouslySetInnerHTML approach so that
 * user-controlled values (category names, imported statement text)
 * can never be interpreted as HTML.
 */
export default function BoldText({ text, strongClassName = 'text-white' }) {
  const parts = String(text ?? '').split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className={strongClassName}>{part}</strong>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  );
}
