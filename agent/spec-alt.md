# Fleet Colour Board

Our detailing team works by colour, not by model. They need a screen that shows
the cars currently in stock, organised the way they actually think about them.

The board loads the inventory from our GraphQL API and shows each car as a card
with its photo, make, model, year and colour, laid out with Material UI. The API
returns each photo at three sizes, and the card should use the one that suits the
viewport: the mobile image at 640px and below, the tablet image from 641px to
1023px, and the desktop image at 1024px and above.

The important difference from a plain inventory list is how they narrow it down.
Detailers pick a colour and see only cars of that colour, so the primary control
is a colour picker listing every colour actually present in the current
inventory, plus an option for showing everything. There is no free-text search on
this screen — searching by model is not how this team works.

They also want the visible cars ordered either oldest-first by year or
alphabetically by make, and they want to see at a glance how many cars match the
colour they picked, shown as a count above the board.

When a car is detailed and leaves the lot, someone needs to add its replacement,
so keep a form for entering a new car's make, model, year and colour that submits
to the API as a mutation and puts the new car straight onto the board.

Put the API access behind a single custom hook so the board components stay
presentational, and write unit tests for the hook and for the controls people
interact with.
