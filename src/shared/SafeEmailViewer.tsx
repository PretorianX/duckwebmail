import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import styled from "styled-components";

const EmailContainer = styled.div`
  all: initial;
  display: block;
  border-radius: 8px;
  overflow: hidden;

  & {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
  }

  & iframe {
    width: 100%;
    border: none;
    background: white;
  }

  & .plain-text {
    white-space: pre-wrap;
    word-break: break-word;
    padding: 15px;
    background: white;
    color: #333;
  }

  & a {
    color: #0066cc;
    text-decoration: underline;
  }

  & img {
    max-width: 100%;
    height: auto;
  }
`;

export default function SafeEmailViewer({
  htmlContent,
  textContent,
  className
}: {
  htmlContent: string;
  textContent: string;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const sanitizedHtml = useMemo(() => {
    if (!htmlContent || htmlContent.trim().length === 0) return "";
    return (
      DOMPurify.sanitize(htmlContent, {
        ADD_TAGS: ["style"],
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["script", "iframe", "object", "embed"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        ALLOW_DATA_ATTR: false
      }) ?? ""
    );
  }, [htmlContent]);

  const srcDoc = useMemo(() => {
    if (!sanitizedHtml) return "";
    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><base target="_blank" /><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:15px}img{max-width:100%;height:auto}</style></head><body>${sanitizedHtml}</body></html>`;
  }, [sanitizedHtml]);

  const adjustHeight = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    iframe.style.height = `${height}px`;
  };

  useEffect(() => {
    adjustHeight();
    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [srcDoc]);

  if (srcDoc) {
    return (
      <EmailContainer className={className}>
        <iframe
          ref={iframeRef}
          title="Email content"
          sandbox="allow-same-origin allow-popups"
          srcDoc={srcDoc}
          onLoad={adjustHeight}
        />
      </EmailContainer>
    );
  }

  return (
    <EmailContainer className={className}>
      <div className="plain-text">{textContent || "No content available for this email."}</div>
    </EmailContainer>
  );
}


