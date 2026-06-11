// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandKitEditorForm } from "./BrandKitEditorForm";

describe("BrandKitEditorForm", () => {
  it("resets editable fields when defaults change", async () => {
    const noopAction = async () => undefined;

    const { rerender } = render(
      <BrandKitEditorForm
        action={noopAction}
        defaults={{
          assetType: "overlay",
          config: {
            primaryColor: "#00d4aa",
          },
          name: "Neon Tactical",
          status: "draft",
        }}
        description="Brand kit editor"
        submitLabel="Speichern"
        title="Neues Brand Kit"
      />,
    );

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Neon Tactical",
    );
    expect(
      (screen.getByLabelText("Config JSON") as HTMLTextAreaElement).value,
    ).toContain("#00d4aa");

    rerender(
      <BrandKitEditorForm
        action={noopAction}
        defaults={{
          assetType: "banner",
          config: {
            accentColor: "#f5c842",
          },
          name: "Cozy Stream",
          status: "active",
        }}
        description="Brand kit editor"
        submitLabel="Speichern"
        title="Neues Brand Kit"
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
        "Cozy Stream",
      );
    });

    expect(
      (screen.getByLabelText("Asset Type") as HTMLSelectElement).value,
    ).toBe("banner");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "active",
    );
    expect(
      (screen.getByLabelText("Config JSON") as HTMLTextAreaElement).value,
    ).toContain("#f5c842");
  });
});
