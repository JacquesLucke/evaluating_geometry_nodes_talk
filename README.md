# Evaluating Geometry Nodes - Talk

The rendered slides are available at [bcon24.jlucke.com](https://bcon24.jlucke.com/). It's based on [RevealJS](https://revealjs.com/).

This uses a server running at [polli.live](https://polli.live) ([source code](https://github.com/JacquesLucke/polli.live)) and a corresponding [Javascript library](https://github.com/JacquesLucke/js.polli.live).

## Convert to Pdf

```sh
# export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
decktape reveal --fragments http://localhost:8000 evaluating_geometry_nodes.pdf
```
