import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";
import { GET_CARS, GET_CAR, ADD_CAR } from "@/graphql/queries";
import App from "@/App";

/**
 * Fixtures deliberately use makes/models/years/colors that do NOT appear in the
 * seeded MSW data, so an assertion can never be satisfied by a seeded record.
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

const nevera = makeCar("991", "Rimac", "Nevera", 2022, "Midnight Purple");
const jesko = makeCar("992", "Koenigsegg", "Jesko", 2023, "Ghost White");
const huayra = makeCar("993", "Pagani", "Huayra", 2021, "Carbon Blue");

const ADD_HUAYRA_VARIABLES = {
  make: "Pagani",
  model: "Huayra",
  year: 2021,
  color: "Carbon Blue",
};

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

function renderApp(mocks: readonly MockedResponse[]) {
  return render(
    <MockedProvider mocks={[...mocks]}>
      <App />
    </MockedProvider>
  );
}

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
 * The add-car form may live behind a disclosure control (e.g. an "Add car"
 * toggle) rather than being rendered inline. Open it if a form is not already
 * on screen.
 */
async function openAddCarForm(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement
) {
  if (container.querySelector("form")) return;

  const entryPoints = screen
    .getAllByRole("button", { name: /add (a )?car/i })
    .filter((button) => button.getAttribute("type") !== "submit");

  const entry = entryPoints[0];
  expect(entry).toBeDefined();
  await user.click(entry as HTMLElement);

  await waitFor(() => expect(container.querySelector("form")).not.toBeNull());
}

const galleryMocks: MockedResponse[] = [
  {
    request: { query: GET_CARS },
    result: { data: { cars: [nevera, jesko] } },
  },
];

describe("App", () => {
  it("shows the gallery of inventory cards by default", async () => {
    renderApp(galleryMocks);

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));

    expect(renderedCardLabels().sort()).toEqual([
      "2022 Rimac Nevera",
      "2023 Koenigsegg Jesko",
    ]);
    expect(screen.getByText(/Midnight Purple/)).toBeInTheDocument();
    expect(screen.getByText(/Ghost White/)).toBeInTheDocument();
  });

  it("shows the add-car form entry point alongside the gallery", async () => {
    const user = userEvent.setup();
    const { container } = renderApp(galleryMocks);

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));

    await openAddCarForm(user, container);

    expect(getMakeField()).toBeInTheDocument();
    expect(getModelField()).toBeInTheDocument();
    expect(getYearField()).toBeInTheDocument();
    expect(getColorField()).toBeInTheDocument();
    expect(getSubmitButton()).toBeInTheDocument();
  });

  it("switches to the full record fetched by id when a car is selected from the gallery", async () => {
    const user = userEvent.setup();

    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [nevera, jesko] } },
      },
      {
        request: { query: GET_CAR, variables: { id: "992" } },
        result: { data: { car: jesko } },
      },
    ];

    renderApp(mocks);

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));

    await user.click(screen.getByText(/Jesko/));

    // The gallery is replaced by the single record.
    await waitFor(() => expect(renderedCardLabels()).toEqual(["2023 Koenigsegg Jesko"]));

    expect(screen.getByText(/Koenigsegg/)).toBeInTheDocument();
    expect(screen.getByText(/Ghost White/)).toBeInTheDocument();
    expect(screen.queryByText(/Nevera/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Midnight Purple/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("returns to the gallery when the back control is activated", async () => {
    const user = userEvent.setup();

    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [nevera, jesko] } },
      },
      {
        request: { query: GET_CAR, variables: { id: "991" } },
        result: { data: { car: nevera } },
      },
      {
        request: { query: GET_CARS },
        result: { data: { cars: [nevera, jesko] } },
      },
    ];

    const { container } = renderApp(mocks);

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));

    await user.click(screen.getByText(/Nevera/));

    await waitFor(() => expect(renderedCardLabels()).toEqual(["2022 Rimac Nevera"]));
    expect(screen.queryByText(/Jesko/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));
    expect(renderedCardLabels().sort()).toEqual([
      "2022 Rimac Nevera",
      "2023 Koenigsegg Jesko",
    ]);
    expect(
      screen.queryByRole("button", { name: /back/i })
    ).not.toBeInTheDocument();

    // The add-car entry point is available again on the gallery view.
    await openAddCarForm(user, container);
    expect(getSubmitButton()).toBeInTheDocument();
  });

  it("adds a car through the form and shows it in the gallery without a reload", async () => {
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

    const { container } = renderApp(mocks);

    await waitFor(() => expect(renderedCardLabels()).toEqual(["2022 Rimac Nevera"]));
    expect(screen.queryByAltText("2021 Pagani Huayra")).not.toBeInTheDocument();

    await openAddCarForm(user, container);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    expect(await screen.findByAltText("2021 Pagani Huayra")).toBeInTheDocument();
    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));
    expect(screen.getByAltText("2022 Rimac Nevera")).toBeInTheDocument();
    expect(screen.getByText(/Carbon Blue/)).toBeInTheDocument();
  });

  it("can open the record of a car that was just added through the form", async () => {
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
      {
        request: { query: GET_CAR, variables: { id: "993" } },
        result: { data: { car: huayra } },
      },
    ];

    const { container } = renderApp(mocks);

    await waitFor(() => expect(renderedCardLabels()).toEqual(["2022 Rimac Nevera"]));

    await openAddCarForm(user, container);

    await fillForm(user, {
      make: "Pagani",
      model: "Huayra",
      year: "2021",
      color: "Carbon Blue",
    });

    await user.click(getSubmitButton());

    expect(await screen.findByAltText("2021 Pagani Huayra")).toBeInTheDocument();

    await user.click(screen.getByText(/Huayra/));

    await waitFor(() => expect(renderedCardLabels()).toEqual(["2021 Pagani Huayra"]));
    expect(screen.queryByText(/Nevera/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("renders the application heading on the gallery view", async () => {
    renderApp(galleryMocks);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(within(heading).getByText(/car inventory/i)).toBeInTheDocument();
  });
});