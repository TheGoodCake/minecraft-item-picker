/* -----------------------------------------------
   STATE
   ----------------------------------------------- */


let currentItem = null; // currently displayed item

let items         = []; // full item list loaded from JSON
let filteredItems = []; // items after filters are applied
let easyItems     = []; // list of easy item IDs

// Fast O(1) item lookup by ID
let itemsById = new Map();

/* -----------------------------------------------
   SPIN ANIMATION — placeholder images cycled
   during the roll animation 
   ----------------------------------------------- */

const SPIN_IMAGES = [
  "images/items/bread.png",
  "images/items/apple.png",
  "images/items/stone_sword.png",
  "images/items/stone_pickaxe.png",
  "images/items/stone_axe.png",
];

const SPIN_STEPS    = 20;  // number of frames before landing
const SPIN_INTERVAL = 150; // ms between each frame

/* -----------------------------------------------
   DATA LOADING
   ----------------------------------------------- */

async function loadData() {
  try {
    // Load main item database
    const itemsRes = await fetch("data/minecraft_items_v1.json");

    if (!itemsRes.ok) {
      throw new Error(`Items fetch failed: ${itemsRes.status}`);
    }

    const jsonData = await itemsRes.json();

    items = Object.values(jsonData.items);

    // Build O(1) lookup map
    itemsById = new Map(
      items.map(item => [item.id, item])
    );

    filteredItems = [...items];

    // Load easy-mode item ID list
    const easyRes = await fetch("data/easy.json");

    if (!easyRes.ok) {
      throw new Error(`Easy list fetch failed: ${easyRes.status}`);
    }

    easyItems = await easyRes.json();

    updateLabel();

    // Preload spin images so the first roll
    // has no black-square flicker
    preloadImages(SPIN_IMAGES);

  } catch (error) {
    console.error("Failed to load data:", error);
  }
}

/* -----------------------------------------------
   IMAGE PRELOADING
   ----------------------------------------------- */

/** Preloads an array of image URLs into browser cache. */
function preloadImages(urls) {
  urls.forEach(preloadImage);
}

/** Preloads a single image URL into browser cache. */
function preloadImage(url) {
  const img = new Image();
  img.src = url;

  return img;
}

/* -----------------------------------------------
   FILTERS
   ----------------------------------------------- */

function applyFilters() {
  let result = [...items];

  if (document.getElementById("easyOnly").checked) {
    const easySet = new Set(easyItems);

    result = result.filter(item => easySet.has(item.id));
  }

  if (document.getElementById("recipesOnly").checked) {
    result = result.filter(item => item.recipes.length > 0);
  }

  filteredItems = result;

  updateLabel();
}

function updateLabel() {
  document.getElementById("itemsCount").textContent =
    `Items (${filteredItems.length})`;
}

/* -----------------------------------------------
   ROLL
   ----------------------------------------------- */

async function rollItem() {
  if (filteredItems.length === 0) {
    alert("No items match your criteria!");
    return;
  }

  const rollBtn   = document.getElementById("rollBtn");
  const recipeBtn = document.getElementById("recipeBtn");
  const itemName  = document.getElementById("itemName");
  const img       = document.getElementById("itemImg");
  const card      = document.getElementById("mcCard");

  // Disable controls while spinning
  rollBtn.disabled   = true;
  recipeBtn.disabled = true;

  itemName.textContent = "";

  // Flip card back to front if needed
  card?.classList.remove("flipped");

  // Pick final item before animation starts
  const finalItem =
    filteredItems[Math.floor(Math.random() * filteredItems.length)];

  // Preload final image during spin animation
  preloadImage(`images/items/${finalItem.icon}`);

  let spinCount  = 0;
  let imageIndex = 0;

  const spinInterval = setInterval(() => {
    if (imageIndex >= SPIN_IMAGES.length) {
      imageIndex = 0;
    }

    img.src = SPIN_IMAGES[imageIndex];

    img.style.filter = "brightness(0)";
    img.classList.add("spinning");

    imageIndex++;
    spinCount++;

    if (spinCount > SPIN_STEPS) {
      clearInterval(spinInterval);

      landOnItem(
        finalItem,
        img,
        rollBtn,
        recipeBtn,
        itemName
      );
    }

  }, SPIN_INTERVAL);
}

/** Finalises the roll animation and displays the chosen item. */
function landOnItem(item, img, rollBtn, recipeBtn, itemName) {
  currentItem = item;

  img.classList.remove("spinning");

  const onLoad = () => {
    img.style.filter = "none";

    itemName.textContent = item.name;

    rollBtn.disabled = false;

    recipeBtn.disabled = item.recipes.length === 0;
  };

  img.addEventListener("load", onLoad, { once: true });

  img.style.filter = "brightness(0)";
  img.src = `images/items/${item.icon}`;

  // Preload recipe ingredient images
  // while user reads the front card
  if (item.recipes.length > 0) {
    preloadRecipeImages(item.recipes[0]);
  }
}

/* -----------------------------------------------
   RECIPE IMAGE PRELOADING
   ----------------------------------------------- */

function preloadRecipeImages(recipe) {
  const urls = [];

  recipe.grid.forEach(row => {
    row.forEach(itemId => {
      if (!itemId) return;

      const itemData = getItemById(itemId);

      if (itemData?.icon) {
        urls.push(`images/items/${itemData.icon}`);
      }
    });
  });

  preloadImages(urls);
}

/* -----------------------------------------------
   RECIPE — main entry point
   ----------------------------------------------- */

function showRecipe() {
  if (!currentItem || currentItem.recipes.length === 0) {
    return;
  }

  const gridElement = document.getElementById("craftingGrid");
  const resultSlot  = document.getElementById("recipeResult");

  gridElement.innerHTML = "";
  resultSlot.innerHTML  = "";


  const recipe = currentItem.recipes[0];

  // Build proper grid type
  if (recipe.type === "furnace") {
    buildFurnaceGrid(recipe.grid, gridElement);
  } else {
    buildCraftingGrid(recipe.grid, gridElement);
  }

  // Result item
  const resultImg = createItemImage(`images/items/${currentItem.icon}`);

  resultSlot.appendChild(resultImg);

  // Optional stack count
  if (recipe.count > 1) {
    const count = document.createElement("span");

    count.className = "item-count";
    count.textContent = recipe.count;

    resultSlot.appendChild(count);
  }

  document
    .getElementById("mcCard")
    .classList.add("flipped");
}

/* -----------------------------------------------
   RECIPE — grid builders
   ----------------------------------------------- */

/** Builds a standard 3×3 crafting grid. */
function buildCraftingGrid(recipeGrid, gridElement) {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {

      const slot = document.createElement("div");

      slot.className = "crafting-slot";

      const itemId = recipeGrid[row][col];

      if (itemId) {
        const itemData = getItemById(itemId);

        if (itemData?.icon) {
          slot.appendChild(
            createRecipeSlotContent(itemData)
          );
        }
      }

      gridElement.appendChild(slot);
    }
  }
}

/**
 * Builds a furnace-style 3×3 grid:
 * row 0 col 1 → ingredient
 * row 1 col 1 → fire icon
 * row 2 col 1 → fuel slot
 */
function buildFurnaceGrid(recipeGrid, gridElement) {
  const ingredientId = recipeGrid[1][1];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {

      const slot = document.createElement("div");

      const isCenter = col === 1;

      if (isCenter && row === 0) {
        // Ingredient slot
        const itemData = getItemById(ingredientId);

        if (itemData?.icon) {
          slot.className = "crafting-slot";

          slot.appendChild(
            createRecipeSlotContent(itemData)
          );
        }

      } else if (isCenter && row === 1) {
        // Fire indicator
        slot.className = "crafting-slot-no-border";

        const img = createItemImage("images/utils/fire.png");

        img.style.filter = "brightness(0.7)";

        slot.appendChild(
          wrapInRecipeItem(img)
        );

      } else if (isCenter && row === 2) {
        // Fuel slot
        slot.className = "crafting-slot";

        const img = createItemImage("images/items/coal.png");

        slot.appendChild(
          wrapInRecipeItem(img)
        );

      } else {
        // Empty spacer
        slot.className = "crafting-slot-no-border";
      }

      gridElement.appendChild(slot);
    }
  }
}

/* -----------------------------------------------
   RECIPE — helpers
   ----------------------------------------------- */

/** Returns item object by ID in O(1). */
function getItemById(id) {
  return itemsById.get(id);
}

/** Creates recipe slot content: image + tooltip. */
function createRecipeSlotContent(itemData) {
  const wrapper = document.createElement("div");

  wrapper.className = "mc-recipe-item";

  const img = createItemImage(`images/items/${itemData.icon}`);

  const tooltip = document.createElement("span");

  tooltip.className = "mc-tooltip";
  tooltip.textContent = itemData.name;

  wrapper.appendChild(img);
  wrapper.appendChild(tooltip);

  return wrapper;
}

/** Wraps image inside .mc-recipe-item div. */
function wrapInRecipeItem(img) {
  const wrapper = document.createElement("div");

  wrapper.className = "mc-recipe-item";

  wrapper.appendChild(img);

  return wrapper;
}

/** Creates pixelated square image element. */
function createItemImage(src) {
  const img = document.createElement("img");

  img.src = src;
  img.className = "mc-item-img";
  img.draggable = false;

  return img;
}

function setYear() {
  document.getElementById("year").textContent = new Date().getFullYear();
}

/* -----------------------------------------------
   INIT
   ----------------------------------------------- */

function init() {
  loadData();

  document
    .getElementById("easyOnly")
    .addEventListener("change", applyFilters);

  document
    .getElementById("recipesOnly")
    .addEventListener("change", applyFilters);

  document
    .getElementById("rollBtn")
    .addEventListener("click", rollItem);

  document
    .getElementById("recipeBtn")
    .addEventListener("click", showRecipe);

    setYear();
}

init();