import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import styled, { keyframes } from "styled-components";
import { useTranslation } from "react-i18next";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const EmailContainer = styled.div`
  all: initial;
  display: block;
  border-radius: 8px;
  overflow: hidden;
  position: relative;

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

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  min-height: 80px;
`;

const Spinner = styled.div`
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 204, 0, 0.25);
  border-top-color: #ffcc00;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
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
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const sanitizedHtml = useMemo(() => {
    if (!htmlContent || htmlContent.trim().length === 0) return "";
    return (
      DOMPurify.sanitize(htmlContent, {
        ADD_TAGS: ["style"],
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["script", "iframe", "object", "embed"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        ALLOW_DATA_ATTR: false,
        // Allow inline images rewritten to blob: URLs (created after authenticated fetch).
        // Keep this tight: only allow http(s), mailto/tel, blob and data.
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
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
    setIsLoading(true);
    adjustHeight();
    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [srcDoc]);

  const handleLoad = () => {
    adjustHeight();
    setIsLoading(false);
  };

  if (srcDoc) {
    return (
      <EmailContainer className={className}>
        {isLoading && (
          <LoadingOverlay>
            <Spinner />
          </LoadingOverlay>
        )}
        <iframe
          ref={iframeRef}
          title={t("mail.emailContent")}
          sandbox="allow-same-origin allow-popups"
          srcDoc={srcDoc}
          onLoad={handleLoad}
        />
      </EmailContainer>
    );
  }

  return (
    <EmailContainer className={className}>
      <div className="plain-text">{textContent || t("mail.noContentAvailable")}</div>
    </EmailContainer>
  );
}


