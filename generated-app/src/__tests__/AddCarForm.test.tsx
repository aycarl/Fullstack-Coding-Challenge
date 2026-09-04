import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect, vi } from "vitest";
import { GET_CARS, ADD_CAR } from "@/graphql/queries";
import AddCarForm from "@/components/AddCarForm";
import CarList from "@/components/CarList";
import type { Car } from "@/types";

/**
 * Fixtures deliberately use makes/models/years that do NOT appear in the seeded
 * MSW data, so an assertion can never be satisfied by a seeded record.
 */
function makeCar(
  id: string,
  make: string,
  model: string,
  year: number,
  color: string
) {
  const label = `${make} ${model}`;
  return {
    __typename: "Car" as const,
    id,
    make,
    model,
    year,
    color,
    mobile: `https://placehold.co/640x360?text=${encodeURIComponent(label)}+Mobile`,
    tablet: `https://placehold.co/1023x576?text=${encodeURIComponent(label)}+Tablet`,
    desktop: `https://placehold.co/1440x810?text=${encodeURIComponent(label)}+Desktop`,
  };
}

const nevera = makeCar("981", "Rimac", "Nevera", 2022, "Midnight Purple");
const huayra = makeCar("982", "Pagani", "Huayra", 2021, "Carbon Blue");

const ADD_HUAYRA_VARIABLES = {
  make: "Pagani",
  model: "Huayra",
  year: 2021,
  color: "Carbon Blue",
};

function getMakeField(): HTMLElement {
  return screen.getByRole("textbox", { name: /make/i });
}

function getModelField(): HTMLElement {
  return screen.getByRole("textbox", { name: /model/i });
}

function getYearField(): HTMLElement {
  return screen.getByRole("spinbutton", { name: /year/i });
}

function getColorField(): HTMLElement {
  return screen.getByRole("textbox", { name: /color/i });
}

function getSubmitButton(): HTMLElement {
  return screen.getByRole("button", { name: /add car/i });
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { make: string; model: string; year: string; color: string }
) {
  await user.clear(getMakeField());
  await user.type(getMakeField(), values.make);
  await user.clear(getModelField());
  await user.type(getModelField(), values.model);
  await user.clear(getYearField());
  await user.type(getYearField(), values.year);
  await user.clear(getColorField());
  await user.type(getColorField(), values.color);
}

/**
 * Each rendered card carries a fallback <img> whose alt is
 * `${year} ${make} ${model}` (see CarCard), so the alt texts in DOM order are a
 * faithful, ordered view of the rendered inventory cards.
 */
function renderedCardLabels(): string[] {
  return screen
    .queryAllByAltText(/^\d{4} /)
    .map((img) => img.getAttribute("alt") ?? "");
}

function renderForm(
  mocks: readonly MockedResponse[],
  onAdded?: (car: Car) => void
) {
  return render(
    <MockedProvider mocks={[...mocks]}>
      <AddCarForm {...(onAdded ? { onAdded } : {})} />
    </MockedProvider>
  );
}

describe("AddCarForm", () => {
  it("renders fields for make, model, year and color plus a submit control", () => {
    renderForm([]);

    expect(getMakeField()).toBeInTheDocument();
    expect(getModelField()).toBeInTheDocument();
    expect(getYearField()).toBeInTheDocument();
    expect(getColorField()).toBeInTheDocument();
    expect(getSubmitButton()).toBeInTheDocument();
  });

  it("sends the AddCar mutation with the values that were typed in", async () => {
    const user = userEvent.setup();
    const addCarResult = vi.fn(() => ({
      data: { addCar: huayra },
    }));

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        result: addCarResult,
      },
    ];

    renderForm(mocks);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    await waitFor(() => expect(addCarResult).toHaveBeenCalledTimes(1));
  });

  it("reports the newly created car through onAdded", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        result: { data: { addCar: huayra } },
      },
    ];

    renderForm(mocks, onAdded);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0]?.[0]).toMatchObject({
      id: "982",
      make: "Pagani",
      model: "Huayra",
      year: 2021,
      color: "Carbon Blue",
    });
  });

  it("shows the newly added car in the inventory list rendered alongside it, without a reload", async () => {
    const user = userEvent.setup();

    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [nevera] } },
      },
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        result: { data: { addCar: huayra } },
      },
      {
        request: { query: GET_CARS },
        result: { data: { cars: [nevera, huayra] } },
      },
    ];

    render(
      <MockedProvider mocks={mocks}>
        <>
          <AddCarForm />
          <CarList />
        </>
      </MockedProvider>
    );

    await waitFor(() => expect(renderedCardLabels()).toEqual(["2022 Rimac Nevera"]));
    expect(screen.queryByAltText("2021 Pagani Huayra")).not.toBeInTheDocument();

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    expect(
      await screen.findByAltText("2021 Pagani Huayra")
    ).toBeInTheDocument();
    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));
    expect(screen.getByAltText("2022 Rimac Nevera")).toBeInTheDocument();
    expect(screen.getByText(/Carbon Blue/)).toBeInTheDocument();
  });

  it("does not fire the mutation and surfaces validation feedback when required fields are empty", async () => {
    const user = userEvent.setup();
    const addCarResult = vi.fn(() => ({
      data: { addCar: huayra },
    }));
    const onAdded = vi.fn();

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        result: addCarResult,
      },
    ];

    renderForm(mocks, onAdded);

    await user.click(getSubmitButton());

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(
      alerts.some((alert) => /required/i.test(alert.textContent ?? ""))
    ).toBe(true);

    expect(addCarResult).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("does not fire the mutation when only some required fields are filled in", async () => {
    const user = userEvent.setup();
    const addCarResult = vi.fn(() => ({
      data: { addCar: huayra },
    }));
    const onAdded = vi.fn();

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        result: addCarResult,
      },
    ];

    renderForm(mocks, onAdded);

    // Colour deliberately left blank.
    await user.type(getMakeField(), "Pagani");
    await user.type(getModelField(), "Huayra");
    await user.clear(getYearField());
    await user.type(getYearField(), "2021");

    await user.click(getSubmitButton());

    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((alert) => /color|colour/i.test(alert.textContent ?? ""))
    ).toBe(true);

    expect(addCarResult).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("clears the validation feedback once the missing fields are supplied and submits", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        result: { data: { addCar: huayra } },
      },
    ];

    renderForm(mocks, onAdded);

    await user.click(getSubmitButton());
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen
          .queryAllByRole("alert")
          .some((alert) => /required/i.test(alert.textContent ?? ""))
      ).toBe(false)
    );
  });

  it("shows an error to the user when the mutation fails", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        error: new Error("Failed to add car"),
      },
    ];

    renderForm(mocks, onAdded);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(
        alerts.some((alert) => /failed to add car/i.test(alert.textContent ?? ""))
      ).toBe(true);
    });

    expect(onAdded).not.toHaveBeenCalled();
  });

  it("keeps the typed values available after a failed submission", async () => {
    const user = userEvent.setup();

    const mocks: MockedResponse[] = [
      {
        request: { query: ADD_CAR, variables: ADD_HUAYRA_VARIABLES },
        error: new Error("Failed to add car"),
      },
    ];

    renderForm(mocks);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(
        alerts.some((alert) => /failed to add car/i.test(alert.textContent ?? ""))
      ).toBe(true);
    });

    expect(getMakeField()).toHaveValue("Pagani");
    expect(getModelField()).toHaveValue("Huayra");
    expect(getYearField()).toHaveValue(2021);
    expect(getColorField()).toHaveValue("Carbon Blue");
  });

  it("renders its fields inside a form element", () => {
    const { container } = renderForm([]);

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(
      within(form as HTMLElement).getByRole("textbox", { name: /make/i })
    ).toBeInTheDocument();
    expect(
      within(form as HTMLElement).getByRole("button", { name: /add car/i })
    ).toBeInTheDocument();
  });
});