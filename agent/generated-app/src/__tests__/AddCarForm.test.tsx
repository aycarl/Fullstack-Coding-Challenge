import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import AddCarForm from "@/components/AddCarForm";

/**
 * Contract under test:
 *
 *   import AddCarForm from "@/components/AddCarForm";
 *
 *   <AddCarForm
 *     onAdd={(input: { make: string; model: string; year: number; color: string }) => Promise<void>}
 *     submitting?={boolean}
 *   />
 *
 * The form exposes labelled fields for make, model, year and color plus a
 * submit button. Submitting a valid form calls `onAdd` exactly once with the
 * entered values (year coerced to a number) and then clears the fields.
 * Submitting with empty required fields must not call `onAdd` and must surface
 * validation feedback.
 */

// Deliberately unlike every MSW-seeded record so the assertions below can only
// ever match the values this test types in.
const newCar = {
  make: "Bertone",
  model: "Stratos Zero",
  year: 1970,
  color: "Vermilion",
};

function getFields() {
  return {
    make: screen.getByLabelText(/make/i),
    model: screen.getByLabelText(/model/i),
    year: screen.getByLabelText(/year/i),
    color: screen.getByLabelText(/color/i),
    submit: screen.getByRole("button", { name: /add|submit|save/i }),
  };
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { make: string; model: string; year: string; color: string }
) {
  const fields = getFields();
  await user.clear(fields.make);
  await user.type(fields.make, values.make);
  await user.clear(fields.model);
  await user.type(fields.model, values.model);
  await user.clear(fields.year);
  await user.type(fields.year, values.year);
  await user.clear(fields.color);
  await user.type(fields.color, values.color);
}

describe("AddCarForm", () => {
  it("renders labelled fields for make, model, year and color plus a submit button", () => {
    render(<AddCarForm onAdd={vi.fn(async () => {})} />);

    const fields = getFields();

    expect(fields.make).toBeInTheDocument();
    expect(fields.model).toBeInTheDocument();
    expect(fields.year).toBeInTheDocument();
    expect(fields.color).toBeInTheDocument();
    expect(fields.submit).toBeInTheDocument();

    expect(fields.make).toHaveValue("");
    expect(fields.model).toHaveValue("");
    expect(fields.color).toHaveValue("");
  });

  it("calls onAdd once with the entered values, year as a number", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => {});

    render(<AddCarForm onAdd={onAdd} />);

    await fillForm(user, {
      make: newCar.make,
      model: newCar.model,
      year: String(newCar.year),
      color: newCar.color,
    });

    await user.click(getFields().submit);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));

    expect(onAdd).toHaveBeenCalledWith({
      make: "Bertone",
      model: "Stratos Zero",
      year: 1970,
      color: "Vermilion",
    });

    const [input] = onAdd.mock.calls[0] as unknown as [
      { make: string; model: string; year: number; color: string }
    ];
    expect(typeof input.year).toBe("number");
    expect(input.year).toBe(1970);
  });

  it("does not call onAdd and shows validation feedback when required fields are empty", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => {});

    render(<AddCarForm onAdd={onAdd} />);

    await user.click(getFields().submit);

    expect(onAdd).not.toHaveBeenCalled();

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  it("does not call onAdd when only some required fields are filled", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => {});

    render(<AddCarForm onAdd={onAdd} />);

    const fields = getFields();
    await user.type(fields.make, newCar.make);
    await user.type(fields.model, newCar.model);

    await user.click(fields.submit);

    expect(onAdd).not.toHaveBeenCalled();
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  it("clears the fields after a successful submit", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => {});

    render(<AddCarForm onAdd={onAdd} />);

    await fillForm(user, {
      make: newCar.make,
      model: newCar.model,
      year: String(newCar.year),
      color: newCar.color,
    });

    await user.click(getFields().submit);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      expect(screen.getByLabelText(/make/i)).toHaveValue("");
    });

    expect(screen.getByLabelText(/model/i)).toHaveValue("");
    expect(screen.getByLabelText(/color/i)).toHaveValue("");

    const year = screen.getByLabelText(/year/i) as HTMLInputElement;
    expect(year.value).toBe("");
  });

  it("keeps the entered values when onAdd rejects", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => {
      throw new Error("Stratos Zero rejected by the inventory");
    });

    render(<AddCarForm onAdd={onAdd} />);

    await fillForm(user, {
      make: newCar.make,
      model: newCar.model,
      year: String(newCar.year),
      color: newCar.color,
    });

    await user.click(getFields().submit);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));

    expect(screen.getByLabelText(/make/i)).toHaveValue("Bertone");
    expect(screen.getByLabelText(/model/i)).toHaveValue("Stratos Zero");
    expect(screen.getByLabelText(/color/i)).toHaveValue("Vermilion");
  });

  it("disables the submit button while submitting", () => {
    render(<AddCarForm onAdd={vi.fn(async () => {})} submitting={true} />);

    expect(getFields().submit).toBeDisabled();
  });

  it("enables the submit button when not submitting", () => {
    render(<AddCarForm onAdd={vi.fn(async () => {})} submitting={false} />);

    expect(getFields().submit).toBeEnabled();
  });

  it("does not call onAdd on the initial render", () => {
    const onAdd = vi.fn(async () => {});

    render(<AddCarForm onAdd={onAdd} />);

    expect(onAdd).not.toHaveBeenCalled();
  });
});