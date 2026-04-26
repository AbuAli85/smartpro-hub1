// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlTowerDismissDialog } from "./ControlTowerDismissDialog";

afterEach(cleanup);

describe("ControlTowerDismissDialog", () => {
  it("renders nothing when open=false", () => {
    render(
      <ControlTowerDismissDialog
        open={false}
        severity="medium"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog when open=true", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="medium"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dismiss signal" })).toBeInTheDocument();
  });

  it("shows 7-day copy for all severities", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="low"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/7 days/)).toBeInTheDocument();
  });

  it("shows extra warning for high severity", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="high"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/does not fix the source issue/);
  });

  it("shows extra warning for critical severity", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="critical"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does NOT show extra warning for medium severity", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="medium"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("confirm button is disabled when reason is empty", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="low"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Dismiss signal" })).toBeDisabled();
  });

  it("confirm button is enabled when reason is non-empty", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="low"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Handled manually" } });
    expect(screen.getByRole("button", { name: "Dismiss signal" })).not.toBeDisabled();
  });

  it("calls onConfirm with trimmed reason on confirm click", () => {
    const onConfirm = vi.fn();
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="medium"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "  Test reason  " } });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss signal" }));
    expect(onConfirm).toHaveBeenCalledWith("Test reason");
  });

  it("calls onClose and resets reason on Cancel", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="low"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Some text" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows 'Dismissing…' and disables confirm while isPending", () => {
    render(
      <ControlTowerDismissDialog
        open={true}
        severity="low"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        isPending={true}
      />,
    );
    const btn = screen.getByRole("button", { name: "Dismissing…" });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });
});
