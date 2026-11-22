import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BioCard } from "../src/storefront-components";
import { templateContent } from "../shared/templates";
const content = templateContent("I teach cooking recipes to students", "en");
it("links the username to Instagram in a separate tab", () => {
  const html = renderToStaticMarkup(
    <BioCard content={content} instagramHandle="creator.name" />,
  );
  expect(html).toContain('href="https://www.instagram.com/creator.name/"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("@creator.name");
});
it.each([undefined, null, "", "javascript:alert(1)", "bad/name"])(
  "does not render a link for missing or invalid username %s",
  (handle) => {
    const html = renderToStaticMarkup(
      <BioCard content={content} instagramHandle={handle} />,
    );
    expect(html).not.toContain("instagram-profile-link");
  },
);
