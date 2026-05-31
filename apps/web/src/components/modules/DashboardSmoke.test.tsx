import { renderToStaticMarkup } from "react-dom/server";
import { Search } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StatCard } from "@streamos/ui";

describe("dashboard UI", () => {
  it("renders a typed stat card", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Discovery score" value="82" trend="+9%" icon={Search} />
    );

    expect(html).toContain("Discovery score");
    expect(html).toContain("82");
  });
});
