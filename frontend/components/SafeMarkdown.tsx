import Markdown from "react-markdown";

/** Provider output is text, never trusted HTML. react-markdown also filters unsafe URLs. */
export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 break-words text-sm leading-relaxed text-ink-800 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-xl [&_pre]:bg-ink-100 [&_pre]:p-3 [&_code]:break-all [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-ink-300 [&_blockquote]:pl-3">
      <Markdown skipHtml components={{ a: ({ children: label, href }) => <a href={href} rel="noopener noreferrer" target={href?.startsWith("http") ? "_blank" : undefined}>{label}</a> }}>{children}</Markdown>
    </div>
  );
}
