"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
            Something went wrong
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#71717a" }}>
            Homebase hit an unexpected error while loading the app. Try again,
            or reload the page.
          </p>
          {retry ? (
            <button
              type="button"
              onClick={() => retry()}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                color: "#fff",
                background: "#047857",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      </body>
    </html>
  );
}
