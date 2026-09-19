import { fireEvent, render, screen } from "@testing-library/react";
import TeleprompterSettings from "../TeleprompterSettings";
import { DEFAULT_TELEPROMPTER_CONFIG } from "../teleprompterConfig";

test("Shadow preset enables cinematic measured-word practice without translation", () => {
  const onChange = jest.fn();
  render(<TeleprompterSettings config={DEFAULT_TELEPROMPTER_CONFIG} onChange={onChange} />);
  fireEvent.click(screen.getByTestId("tp-preset-shadow"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    karaoke: true,
    centerFocus: true,
    showTranslation: false,
    autoScroll: true,
  }));
});

test("Understand preset keeps the same timing behavior and reveals Khmer", () => {
  const onChange = jest.fn();
  render(<TeleprompterSettings config={DEFAULT_TELEPROMPTER_CONFIG} onChange={onChange} />);
  fireEvent.click(screen.getByTestId("tp-preset-understand"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ centerFocus: true, showTranslation: true }));
});

test("cinematic focus is directly discoverable and advanced controls use disclosure", () => {
  const onChange = jest.fn();
  render(<TeleprompterSettings config={DEFAULT_TELEPROMPTER_CONFIG} onChange={onChange} />);
  expect(screen.getByTestId("tp-setting-center-focus")).toBeInTheDocument();
  expect(screen.queryByTestId("tp-settings-advanced")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /custom controls/i }));
  expect(screen.getByTestId("tp-settings-advanced")).toBeInTheDocument();
});