import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";
import { GET_CARS, ADD_CAR } from "@/graphql/queries";
import App from "@/App";

/**
 * Integration contract under test:
 *
 *   import App from "@/App";
 *
 * `App` composes the generated pieces:
 *   - `useCars()`            — reads `GET_CARS`, exposes `addCar` backed by `ADD_CAR`
 *   - `CarFilters`           — a textbox named /search/i and a combobox named /sort/i
 *                              offering "Year" and "Make"
 *   - `filterAndSortCars`    — model substring filter, ascending year / alphabetical make
 *   - `CarList` / `CarCard`  — one <picture> + <img alt="{make} {model}"> per car
 *   - `AddCarForm`           — labelled make / model / year / color fields + submit button
 *
 * The whole journey is exercised against a single mounted tree: the test never
 * re-renders or re-mounts `App` after the initial render.
 */

// ---------------------------------------------------------------------------
// Fixtures
//
// Deliberately unlike every MSW-seeded record (see src/mocks/data.ts) so the
// assertions below can only ever match the cars this test supplies. Years and
// makes are chosen so that "sort by year" and "sort by make" produce visibly
// different orderings.
// ---------------------------------------------------------------------------

const sonett = {
  __typename: "Car" as const,
  id: "931",
  make: "Saab",
  model: "Sonett",
  year: 1967,
  color: "Marigold",
  mobile: "https://placehold.co/640x360?text=Saab+Sonett+Mobile",
  tablet: "https://placehold.co/1023x576?text=Saab+Sonett+Tablet",
  desktop: "https://placehold.co/1440x810?text=Saab+Sonett+Desktop",
};

const fulvia = {
  __typename: "Car" as const,
  id: "932",
  make: "Lancia",
  model: "Fulvia",
  year: 1971,
  color: "Chartreuse",
  mobile: "https://placehold.co/640x360?text=Lancia+Fulvia+Mobile",
  tablet: "https://placehold.co/1023x576?text=Lancia+Fulvia+Tablet",
  desktop: "https://placehold.co/1440x810?text=Lancia+Fulvia+Desktop",
};

const isetta = {
  __typename: "Car" as const,
  id: "933",
  make: "Iso",
  model: "Isetta",
  year: 1955,
  color: "Cerulean",
  mobile: "https://placehold.co/640x360?text=Iso+Isetta+Mobile",
  tablet: "https://placehold.co/1023x576?text=Iso+Isetta+Tablet",
  desktop: "https://placehold.co/1440x810?text=Iso+Isetta+Desktop",
};

const seededCars = [sonett, fulvia, isetta];

/**
 * The car the test itself creates. Its make, model, year and colour differ
 * from every seeded record above and from every MSW-seeded record, so an
 * assertion about it cannot accidentally match a car that was already there.
 */
const newCarInput = {
  make: "DeLorean",
  model: "DMC-12",
  year: 1981,
  color: "Stainless",
};

const createdCar = {
  __typename: "Car" as const,
  id: "934",
  ...newCarInput,
  mobile: "https://placehold.co/640x360?text=DeLorean+DMC-12+Mobile",
  tablet: "https://placehold.co/1023x576?text=DeLorean+DMC-12+Tablet",
  desktop: "https://placehold.co/1440x810?text=DeLorean+DMC-12+Desktop",
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function getCarsMock(cars: readonly unknown[] = seededCars): MockedResponse {
  return {
    request: { query: GET_CARS },
    result: { data: { cars: [...cars] } },
  };
}

function addCarMock(): MockedResponse {
  return {
    request: { query: ADD_CAR, variables: { ...newCarInput } },
    result: { data: { addCar: createdCar } },
  };
}

function renderApp(mocks: readonly MockedResponse[]) {
  return render(
    <MockedProvider mocks={[...mocks]} addTypename={true}>
      <App />
    </MockedProvider>
  );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const MODELS = ["Sonett", "Fulvia", "Isetta", "DMC-12"];

/** Every rendered car card, in DOM order, reduced to its model name. */
function visibleModels(): string[] {
  return screen.queryAllByRole("img").map((img) => {
    const alt = (img.getAttribute("alt") ?? "").trim();
    return (
      MODELS.find((model) =>
        alt.toLowerCase().includes(model.toLowerCase())
      ) ?? alt
    );
  });
}

function cardCount(): number {
  return screen.queryAllByRole("img").length;
}

function getSearchBox(): HTMLElement {
  return screen.getByRole("textbox", { name: /search/i });
}

/**
 * The add-car form. Field queries are scoped to it because the gallery's sort
 * control also offers a "Year" option, so an unscoped query risks ambiguity.
 */
function formScope() {
  const form = document.querySelector("form");
  return within((form as HTMLElement | null) ?? document.body);
}

async function chooseSort(
  user: ReturnType<typeof userEvent.setup>,
  optionName: RegExp
) {
  await user.click(screen.getByRole("combobox", { name: /sort/i }));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: optionName }));
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  );
}

async function waitForGallery(expected = seededCars.length) {
  await screen.findByRole("img", { name: /saab\s+sonett/i });
  await waitFor(() => expect(cardCount()).toBe(expected));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App integration", () => {
  it("shows a progress indicator while the inventory loads", () => {
    renderApp([getCarsMock()]);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("lists every car returned by GET_CARS in the gallery", async () => {
    renderApp([getCarsMock()]);

    await waitForGallery();

    expect(
      screen.getByRole("img", { name: /saab\s+sonett/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /lancia\s+fulvia/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /iso\s+isetta/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/Sonett/)).toBeInTheDocument();
    expect(screen.getByText(/Marigold/)).toBeInTheDocument();
    expect(screen.getByText(/1967/)).toBeInTheDocument();

    expect(screen.getByText(/Fulvia/)).toBeInTheDocument();
    expect(screen.getByText(/Chartreuse/)).toBeInTheDocument();

    expect(screen.getByText(/Isetta/)).toBeInTheDocument();
    expect(screen.getByText(/Cerulean/)).toBeInTheDocument();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces an error alert when the inventory query fails", async () => {
    renderApp([
      {
        request: { query: GET_CARS },
        error: new Error("Sonett inventory feed unavailable"),
      },
    ]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Sonett inventory feed unavailable/i);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("narrows the visible cards to the matching model as the user types in the search box", async () => {
    const user = userEvent.setup();
    renderApp([getCarsMock()]);

    await waitForGallery();

    await user.type(getSearchBox(), "Fulvia");

    await waitFor(() => expect(cardCount()).toBe(1));

    expect(getSearchBox()).toHaveValue("Fulvia");
    expect(visibleModels()).toEqual(["Fulvia"]);
    expect(
      screen.getByRole("img", { name: /lancia\s+fulvia/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /saab\s+sonett/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /iso\s+isetta/i })
    ).not.toBeInTheDocument();

    await user.clear(getSearchBox());

    await waitFor(() => expect(cardCount()).toBe(seededCars.length));
  });

  it("matches the search text case-insensitively against the model", async () => {
    const user = userEvent.setup();
    renderApp([getCarsMock()]);

    await waitForGallery();

    await user.type(getSearchBox(), "sonett");

    await waitFor(() => expect(visibleModels()).toEqual(["Sonett"]));

    await user.clear(getSearchBox());
    await user.type(getSearchBox(), "SETT");

    await waitFor(() => expect(visibleModels()).toEqual(["Isetta"]));
  });

  it("reorders the visible cards by year and by make when the sort control changes", async () => {
    const user = userEvent.setup();
    renderApp([getCarsMock()]);

    await waitForGallery();

    await chooseSort(user, /^year$/i);

    await waitFor(() =>
      expect(visibleModels()).toEqual(["Isetta", "Sonett", "Fulvia"])
    );

    await chooseSort(user, /^make$/i);

    await waitFor(() =>
      expect(visibleModels()).toEqual(["Isetta", "Fulvia", "Sonett"])
    );

    expect(cardCount()).toBe(seededCars.length);
  });

  it("sorts the filtered subset rather than the whole inventory", async () => {
    const user = userEvent.setup();
    renderApp([getCarsMock()]);

    await waitForGallery();

    await chooseSort(user, /^year$/i);
    await user.type(getSearchBox(), "ett");

    await waitFor(() => expect(visibleModels()).toEqual(["Isetta", "Sonett"]));
  });

  it("adds a car through the form and shows it in the gallery without any re-render by the test", async () => {
    const user = userEvent.setup();

    renderApp([
      getCarsMock(),
      addCarMock(),
      // Only used if the implementation refreshes the list via refetch;
      // ignored when the Apollo cache is updated directly.
      getCarsMock([...seededCars, createdCar]),
    ]);

    await waitForGallery();

    expect(
      screen.queryByRole("img", { name: /delorean\s+dmc-12/i })
    ).not.toBeInTheDocument();

    // Captured before the mutation: if the tree were remounted, this node
    // would be replaced rather than reused.
    const searchBoxBefore = getSearchBox();

    const form = formScope();

    await user.type(form.getByLabelText(/make/i), newCarInput.make);
    await user.type(form.getByLabelText(/model/i), newCarInput.model);
    await user.clear(form.getByLabelText(/year/i));
    await user.type(form.getByLabelText(/year/i), String(newCarInput.year));
    await user.type(form.getByLabelText(/color/i), newCarInput.color);

    await user.click(
      form.getByRole("button", { name: /add|submit|save|create/i })
    );

    expect(
      await screen.findByRole("img", { name: /delorean\s+dmc-12/i })
    ).toBeInTheDocument();

    await waitFor(() => expect(cardCount()).toBe(seededCars.length + 1));

    expect(screen.getByText(/DMC-12/)).toBeInTheDocument();
    expect(screen.getByText(/Stainless/)).toBeInTheDocument();
    expect(screen.getByText(/1981/)).toBeInTheDocument();

    // The seeded cars are still present alongside the newly created one.
    expect(
      screen.getByRole("img", { name: /saab\s+sonett/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /lancia\s+fulvia/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /iso\s+isetta/i })
    ).toBeInTheDocument();

    // Same DOM node => the app was never re-rendered or remounted by the test.
    expect(getSearchBox()).toBe(searchBoxBefore);

    // The form resets after a successful submit.
    await waitFor(() =>
      expect(formScope().getByLabelText(/make/i)).toHaveValue("")
    );
    expect(formScope().getByLabelText(/model/i)).toHaveValue("");
    expect(formScope().getByLabelText(/color/i)).toHaveValue("");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the newly added car searchable and sortable in the same mounted tree", async () => {
    const user = userEvent.setup();

    renderApp([
      getCarsMock(),
      addCarMock(),
      getCarsMock([...seededCars, createdCar]),
    ]);

    await waitForGallery();

    const form = formScope();
    await user.type(form.getByLabelText(/make/i), newCarInput.make);
    await user.type(form.getByLabelText(/model/i), newCarInput.model);
    await user.clear(form.getByLabelText(/year/i));
    await user.type(form.getByLabelText(/year/i), String(newCarInput.year));
    await user.type(form.getByLabelText(/color/i), newCarInput.color);
    await user.click(
      form.getByRole("button", { name: /add|submit|save|create/i })
    );

    await screen.findByRole("img", { name: /delorean\s+dmc-12/i });
    await waitFor(() => expect(cardCount()).toBe(seededCars.length + 1));

    await chooseSort(user, /^year$/i);

    await waitFor(() =>
      expect(visibleModels()).toEqual([
        "Isetta",
        "Sonett",
        "Fulvia",
        "DMC-12",
      ])
    );

    await chooseSort(user, /^make$/i);

    await waitFor(() =>
      expect(visibleModels()).toEqual([
        "DMC-12",
        "Isetta",
        "Fulvia",
        "Sonett",
      ])
    );

    await user.type(getSearchBox(), "dmc");

    await waitFor(() => expect(visibleModels()).toEqual(["DMC-12"]));
    expect(
      screen.queryByRole("img", { name: /saab\s+sonett/i })
    ).not.toBeInTheDocument();
  });
});