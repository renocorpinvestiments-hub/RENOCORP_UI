// src/test/a11y/components.a11y.test.jsx
// NEW FILE — P2 fix (RENOCORP_PRODUCTION_READINESS.md §5,
// "Accessibility": "No evidence of ARIA roles/keyboard nav audit
// in components/* — run an automated a11y pass (axe-core) given
// this is a consumer-facing money app.")
//
// SCOPE
// ------------------------------------------------------------
// axe-core catches a real, useful subset of accessibility bugs
// automatically (missing labels, invalid ARIA usage, contrast
// issues, etc) but it CANNOT verify keyboard behavior (e.g. "does
// ArrowRight move focus between tabs?") — that requires scripted
// interaction, which the second describe block below covers for
// TabBar specifically, since that's exactly the gap this same P2
// pass found and fixed (see components/TabBar.jsx changelog).
//
// Run: npm run test:a11y

import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import "vitest-axe/extend-expect";

import { Modal } from "../../components/Modal.jsx";
import { TabBar } from "../../components/TabBar.jsx";
import { Alert } from "../../components/Alert.jsx";

describe("axe: no automatically-detectable a11y violations", () => {
  it("Modal (open, with title) has no violations", async () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="Confirm Withdrawal">
        <p>Are you sure you want to withdraw UGX 10,000?</p>
      </Modal>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("TabBar has no violations", async () => {
    const tabs = [
      { key: "all", label: "All" },
      { key: "videos", label: "Videos" },
      { key: "surveys", label: "Surveys" },
    ];
    const { container } = render(
      <TabBar tabs={tabs} active="all" onChange={() => {}} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("Alert (error, dismissible) has no violations", async () => {
    const { container } = render(
      <Alert type="error" message="Withdrawal failed. Please try again." onDismiss={() => {}} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("TabBar: WAI-ARIA tablist keyboard pattern", () => {
  const tabs = [
    { key: "all", label: "All" },
    { key: "videos", label: "Videos" },
    { key: "surveys", label: "Surveys" },
  ];

  it("ArrowRight moves selection to the next tab (wrapping at the end)", () => {
    let active = "all";
    const onChange = (key) => {
      active = key;
    };
    const { rerender } = render(
      <TabBar tabs={tabs} active={active} onChange={onChange} />
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(active).toBe("videos");

    rerender(<TabBar tabs={tabs} active={active} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(active).toBe("surveys");

    // Wraps back to the first tab
    rerender(<TabBar tabs={tabs} active={active} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(active).toBe("all");
  });

  it("Home / End jump to the first / last tab", () => {
    let active = "videos";
    const onChange = (key) => {
      active = key;
    };
    const { rerender } = render(
      <TabBar tabs={tabs} active={active} onChange={onChange} />
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(active).toBe("surveys");

    rerender(<TabBar tabs={tabs} active={active} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(active).toBe("all");
  });

  it("only the active tab is in the natural tab order (roving tabIndex)", () => {
    render(<TabBar tabs={tabs} active="videos" onChange={() => {}} />);
    const tabButtons = screen.getAllByRole("tab");
    for (const btn of tabButtons) {
      const expected = btn.textContent.includes("Videos") ? "0" : "-1";
      expect(btn).toHaveAttribute("tabindex", expected);
    }
  });
});
