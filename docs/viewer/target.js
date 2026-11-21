function fractionOfPi(num, den) {
  if (num === 0) return "0";
  let a = Math.abs(num), b = den;
  while (b) [a, b] = [b, a % b];
  const top = Math.abs(num / a), bottom = den / a;
  return (num < 0 ? "−" : "") + (top === 1 ? "" : top) + "π" + (bottom === 1 ? "" : "/" + bottom);
}

// Lookup by surface invariants. Only locally injective realisations count as CCPs.
function createTargetFinder({models, routes, modelTitle, openModel, openRoute}) {
  const el = id => document.getElementById(id);
  const orientation = el("target-orientation"), genus = el("target-genus"), vertices = el("target-vertices");
  const regularModels = models.filter(model => !model.name.startsWith("singular_"));
  const exactCount = value => Number.isInteger(value) && Number.isSafeInteger(128 * value);
  const minus = value => String(value).replace("-", "−");
  const routeStages = routes.flatMap(route => route.steps.map((step, index) => ({route, model: step.model, index}))
    .filter(stage => Number.isFinite(stage.model.expected_defect)));

  function lowerBound(orientable, g) {
    // The strengthened small-genus bounds in the paper's table of vertex minima.
    const small = orientable ? [4,8,10,10,11,12,13,13] : [0,9,9,9,9,10,10,10];
    if (g < small.length) return small[g];
    return Math.ceil((7 + Math.sqrt(1 + (orientable ? 48 : 24) * g)) / 2);
  }

  function fragment() {
    if (!genus.value) return "#target";
    const params = new URLSearchParams({o: orientation.value === "orientable" ? "1" : "0", g: genus.value});
    if (vertices.value) params.set("v", vertices.value);
    return "#target?" + params.toString();
  }

  function constructedCounts(orientable, g) {
    const counts = new Set(recipeVertexCounts(orientable, g).filter(exactCount));
    const sameSurface = model => model.orientable === orientable && model.genus === g;
    regularModels.filter(sameSurface).forEach(model => counts.add(model.vertices.length));
    routeStages.filter(stage => sameSurface(stage.model)).forEach(stage => counts.add(stage.model.vertices.length));
    return counts;
  }

  function selectMinimum() {
    const orientable = orientation.value === "orientable";
    const g = genus.valueAsNumber;
    if (!exactCount(g) || g < (orientable ? 0 : 1)) return;
    const counts = constructedCounts(orientable, g);
    vertices.value = counts.size ? Math.min(...counts) : "";
  }

  function setSuggestions(orientable, g, v) {
    const parent = el("target-suggestions");
    parent.replaceChildren();
    const counts = constructedCounts(orientable, g);
    if (g <= 2) {
      const [threshold] = recipeVertexCounts(orientable, g);
      for (const nearby of [v-1, v+1]) {
        if (exactCount(nearby) && nearby >= threshold) counts.add(nearby);
      }
    }
    counts.delete(v);
    const nearest = [...counts].sort((a,b) => Math.abs(a-v)-Math.abs(b-v) || a-b).slice(0,3).sort((a,b) => a-b);
    if (!nearest.length) return;
    const caption = document.createElement("p");
    caption.textContent = "Other constructed vertex counts";
    parent.append(caption);
    nearest.forEach(n => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(n);
      button.setAttribute("aria-label", "Use " + n + " vertices");
      button.onclick = () => { vertices.value = n; update(true); vertices.focus(); };
      parent.append(button);
    });
  }

  function action(label, fn) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = fn;
    el("target-actions").append(button);
  }

  function showResult({status, title, message = "", steps = [], reference = "", source}) {
    el("target-status").textContent = status;
    el("recipe-title").textContent = title;
    el("target-message").textContent = message;
    el("target-message").hidden = !message;
    el("target-steps").replaceChildren(...steps.map(instruction => {
      const li = document.createElement("li");
      li.textContent = instruction;
      return li;
    }));
    el("target-reference").textContent = reference;
    if (source) {
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.label;
      el("target-reference").append(" · ", link);
    }
    el("target-reference").hidden = !reference && !source;
  }

  function update(save = false) {
    const orientable = orientation.value === "orientable", g = genus.valueAsNumber, v = vertices.valueAsNumber;
    genus.min = orientable ? "0" : "1";
    el("genus-meaning").textContent = orientable ? "For an orientable surface, g counts handles." : "For a non-orientable surface, g counts crosscaps.";
    el("target-actions").replaceChildren();
    el("target-suggestions").replaceChildren();
    // Integer products in the count formulas and denominators must remain exact.
    const validG = exactCount(g) && g >= Number(genus.min);
    const validV = exactCount(v) && v >= 1;
    genus.setAttribute("aria-invalid", String(!validG));
    vertices.setAttribute("aria-invalid", String(!validV));
    el("target-invariants").hidden = !(validG && validV);
    if (save && validG && (validV || !vertices.value) && location.hash !== fragment()) {
      // A hash-only replacement works with both a local file and a project Pages URL.
      history.replaceState(null, "", fragment());
    }
    if (validG && !vertices.value && !constructedCounts(orientable, g).size) {
      showResult({status:"Vertex count", title:"No construction within the supported range",
        message:"The vertex counts of the indexed constructions for this genus exceed the planner’s exact integer range."});
      return;
    }
    if (!(validG && validV)) {
      const tooLarge = Math.max(g || 0, v || 0) > Number.MAX_SAFE_INTEGER / 128;
      showResult({status:"Target parameters", title:"Check the target values",
        message: tooLarge ? "These counts exceed the exact integer range used by the planner."
          : "Enter an integer genus of at least " + genus.min + " and a positive integer vertex count."});
      return;
    }
    const chi = orientable ? 2 - 2*g : 2 - g;
    el("target-chi").textContent = minus(chi);
    el("target-defect").textContent = fractionOfPi(2*chi, v);
    setSuggestions(orientable,g,v);
    const min = lowerBound(orientable, g);
    if (v < min) {
      showResult({status:"Vertex lower bound", title:"Too few vertices",
        message:"A " + (orientable ? "genus-" + g + " embedded orientable" : "genus-" + g + " immersed non-orientable") +
          " CCP requires at least " + min + " vertices by the lower bound in the paper.", reference:"§5 · Vertex bounds"});
      return;
    }

    const exact = model => model.orientable === orientable && model.genus === g && model.vertices.length === v;
    const meshes = regularModels.filter(exact);
    const matches = routeStages.filter(stage => exact(stage.model));
    matches.sort((a,b) => b.index - a.index);
    const animated = matches[0];
    let recipe, stages;
    if (animated && animated.index > 0) {
      const route = animated.route, upto = route.steps.slice(0, animated.index+1);
      const precursor = routes.find(other => other !== route && other.steps.at(-1).model.name === upto[0].model.name);
      stages = precursor ? [...precursor.steps.map(step => ({...step, reference:precursor.reference})), ...upto.slice(1)] : upto;
      const steps = stages.map(step => step.description);
      if (route.id === "vertices") steps.unshift(...orientableRecipe(1,9).steps);
      recipe = {title:route.title, steps, reference:route.reference};
    } else if (animated?.route.id === "windows" && animated.index === 0) {
      recipe = {title:"A square prism", steps:[
        "Take a square of side two and erect a right prism of height two.",
        "Keep the two square bases and four lateral squares. Three right angles meet at each of the eight vertices, giving defect π/2."
      ], reference:animated.route.reference};
    } else {
      recipe = orientable ? orientableRecipe(g,v) : nonorientableRecipe(g,v);
    }
    if (!recipe && meshes.length) {
      const model = meshes[0];
      recipe = {title:modelTitle(model), steps:[
        "Take the " + v + " indexed vertices in the coordinate data for " + modelTitle(model) + ".",
        "Join the vertices of each listed face in cyclic order by straight edges, and fill the resulting planar polygon. Identify shared edges with the same vertex labels."
      ], reference:"Companion collection · Original polygon coordinates and face cycles"};
      const link = document.createElement("a");
      link.href = "https://github.com/shizuo-kaji/Polyhedra-of-Constant-Gaussian-Curvature/blob/main/models/" + model.name + ".json";
      link.textContent = "Coordinate and face data";
      el("target-actions").append(link);
    }
    if (!recipe) {
      const open = g === 2 && ((orientable && v <= 15) || (!orientable && v <= 14));
      const message = open
        ? "The paper leaves this count open. Its unresolved range is " + (orientable ? "10–15 vertices for orientable genus two." : "9–14 vertices for the Klein bottle.")
        : "The planner has no construction for this particular count. At each fixed genus the paper realises all sufficiently large vertex counts. This does not determine whether the chosen count occurs.";
      showResult({status:open ? "Open in the paper" : "No indexed construction",title:"No construction for this target in the planner",message,reference:"§5 · Vertex bounds"});
      return;
    }
    showResult({status:(orientable ? "Embedded" : "Immersed") + " CCP · " + v + " vertices", ...recipe});
    if (animated && animated.index > 0) action("Follow in 3D · " + animated.route.title, () => openRoute(animated.route,stages));
    for (const model of meshes) action("View model · " + modelTitle(model), () => openModel(model));
    if (!meshes.length && animated?.index === 0) action("Inspect the starting model", () => openRoute(animated.route, animated.route.steps.slice(0, 1)));
  }

  orientation.onchange = () => {
    if (orientation.value === "nonorientable" && genus.valueAsNumber === 0) genus.value = "1";
    surfaceChanged();
  };
  function surfaceChanged() {
    selectMinimum();
    update(true);
  }
  genus.addEventListener("input", surfaceChanged);
  vertices.addEventListener("input", () => update(true));
  function restore(hash) {
    const params = new URLSearchParams(hash.split("?")[1] || "");
    if (params.has("o")) orientation.value = params.get("o") === "0" ? "nonorientable" : "orientable";
    if (params.has("g")) genus.value = params.get("g");
    if (params.has("v")) vertices.value = params.get("v");
    else selectMinimum();
    update();
  }
  selectMinimum();
  return {fragment,restore};
}
