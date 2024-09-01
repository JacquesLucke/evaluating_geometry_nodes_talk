let polli_live_url = "https://polli.live";
// let polli_live_url = "http://192.168.0.15:9000";
let polli_live_url_human = "polli.live";
let current_session = null;
let next_response_id = 0;
let option_colors = ["#67B8DB", "#DB7873", "#9CDB67", "#DBA667"];
const qrcode_size = 256;
const poll_interval_ms = 100;

function main() {
  setTimeout(async () => {
    await prepare_session();
    session_updated();
  }, 0);

  // Old responses are stored in local storage so that they are still available
  // after a reload.
  global_responses.load_from_local_storage();

  all_polls = initialize_poll_instances();
  for (const poll of all_polls) {
    poll.initialize();
    update_poll_result(poll);
  }

  start_poll_results_loop();

  Reveal.on("slidechanged", async function (event) {
    stop_getting_poll_results();
    const current_slide = event.currentSlide;
    const poll = find_poll_on_slide(current_slide);
    if (!poll) {
      return;
    }
    await start_poll(poll);
  });
}

async function prepare_session() {
  current_session = null;
  next_response_id = 0;
  try {
    let desired_session = localStorage.getItem("session");
    const res = await fetch(`${polli_live_url}/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: desired_session,
    });
    if (res.ok) {
      current_session = await res.json();
      localStorage.setItem("session", JSON.stringify(current_session));
      return;
    }
  } catch {}
  console.error(
    "Could not initialize polli.live session. Check that the server is running. Interactive features are disabled."
  );
}

async function make_new_session() {
  localStorage.removeItem("session");
  await prepare_session();
}

class SingleChoicePoll {
  static class_name = "poll-single-choice";

  constructor(poll_container) {
    this.container = poll_container;
    this.id = this.container.id;

    this.options = [];
    this.options_html = [];
    for (const option_elem of this.container.children) {
      this.options.push(option_elem.innerText);
      this.options_html.push(option_elem.innerHTML);
    }

    this.hide_results_initially =
      this.container.hasAttribute("data-hide-result");
    this.results_revealed = !this.hide_results_initially;
  }

  initialize() {
    this.container.innerHTML = "";

    if (this.hide_results_initially) {
      this.options_container = document.createElement("div");
      this.container.appendChild(this.options_container);

      this.options_container.classList.add("options-container");

      for (let option_i = 0; option_i < this.options.length; option_i++) {
        const option_elem = document.createElement("div");
        this.options_container.appendChild(option_elem);
        option_elem.classList.add("option-elem");
        option_elem.innerHTML = this.options_html[option_i];
        option_elem.style.backgroundColor = option_colors[option_i];
      }
    }

    this.result_elem = document.createElement("div");
    this.container.appendChild(this.result_elem);

    const join_elem = create_join_elem();
    this.container.appendChild(join_elem);
  }

  update_with_responses(response_by_user) {
    // Clear old results.
    this.result_elem.innerHTML = "";

    const count_by_option = new Map();
    for (const option of this.options) {
      count_by_option.set(option, 0);
    }

    let responses_num = 0;
    for (const choosen_option of response_by_user.values()) {
      if (!this.options.includes(choosen_option)) {
        continue;
      }
      responses_num += 1;
      count_by_option.set(
        choosen_option,
        count_by_option.get(choosen_option) + 1
      );
    }

    const sorted_options = [...this.options];
    if (this.hide_results_initially) {
      // Sort by count in case the results should be hidden initially.
      // Otherwise, it's obvious which bar corresponds to which option.
      sorted_options.sort(
        (a, b) => count_by_option.get(b) - count_by_option.get(a)
      );
    }

    for (const option of sorted_options) {
      const option_i = this.options.indexOf(option);
      const option_html = this.options_html[option_i];
      const count = count_by_option.get(option);
      const option_elem = document.createElement("div");
      option_elem.classList.add("poll-bar");
      this.result_elem.appendChild(option_elem);

      const percentage = (count / Math.max(1, responses_num)) * 100;
      option_elem.style.width = `${percentage * 0.9}%`;

      if (this.results_revealed) {
        option_elem.innerHTML = `${option_html}: ${count}`;
        option_elem.style.backgroundColor = option_colors[option_i];
      } else {
        option_elem.innerHTML = `${count}`;
      }

      option_elem.addEventListener("click", async () => {
        this.results_revealed = true;
        this.options_container.style.display = "None";
        this.update_with_responses(response_by_user);
      });
    }
  }

  async get_poll_page() {
    let page = await fetch("poll/choice_poll.template.html");
    page = await page.text();
    page = page.replace("POLL_ID", this.id);
    page = page.replace(
      '"MULTIPLE_CHOICE_OPTIONS"',
      JSON.stringify(this.options)
    );
    page = page.replace(
      '"MULTIPLE_CHOICE_COLORS"',
      JSON.stringify(option_colors)
    );
    return page;
  }

  is_valid_response(response) {
    return this.options.includes(response);
  }
}

class SlidePoll {
  static class_name = "poll-slide";

  constructor(poll_container) {
    this.container = poll_container;
    this.id = this.container.id;

    this.options = [];
    for (const option_elem of this.container.children) {
      this.options.push(option_elem.innerHTML);
    }
  }

  initialize() {
    this.container.innerHTML = "";

    this.result_elem = document.createElement("div");
    this.result_elem.style.marginTop = "1em";
    this.container.appendChild(this.result_elem);

    this.options_elem = document.createElement("div");
    this.container.appendChild(this.options_elem);
    this.options_elem.style.display = "flex";
    this.options_elem.style.justifyContent = "space-between";
    this.options_elem.style.marginBottom = "1em";
    for (const option of this.options) {
      const option_elem = document.createElement("div");
      option_elem.innerHTML = option;
      this.options_elem.appendChild(option_elem);
    }

    const join_elem = create_join_elem();
    this.container.appendChild(join_elem);
  }

  update_with_responses(response_by_user) {
    this.result_elem.innerHTML = "";

    this.result_elem.style.backgroundColor = "#dba667";
    this.result_elem.style.width = "100%";
    this.result_elem.style.height = "5em";

    const responses = Array.from(response_by_user.values());

    const resolution = 300;

    const falloffs = [];

    const falloffs_num = Math.floor(resolution * 0.1);
    for (let i = 0; i < falloffs_num; i++) {
      const x = ((i + 1) / falloffs_num) * 2.3;
      falloffs.push(Math.exp(-x * x));
    }

    let heights = Array(resolution).fill(0);
    for (const value of responses) {
      const value_f = parseFloat(value) / 100;
      const center_index = Math.floor(value_f * resolution);
      if (center_index < heights.length) {
        heights[center_index] += 1;
      }
      for (let falloff_i = 0; falloff_i < falloffs.length; falloff_i++) {
        const falloff = falloffs[falloff_i];
        const index_offset = falloff_i + 1;
        const left_index = center_index - index_offset;
        if (left_index >= 0) {
          heights[left_index] += falloff;
        }
        const right_index = center_index + index_offset;
        if (right_index < heights.length) {
          heights[right_index] += falloff;
        }
      }
    }

    const max_height = Math.max(...heights);
    if (max_height > 0) {
      heights = heights.map((h) => h / max_height);
    }
    heights = heights.map((h) => Math.max(h, 0.02));

    const points = [];
    points.push([0, 1]);
    for (let i = 0; i < heights.length; i++) {
      const height = heights[i];
      points.push([i / (heights.length - 1), 1 - height]);
    }
    points.push([1, 1]);

    let polygon_str = "polygon(";
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      polygon_str += `${point[0] * 100}% ${point[1] * 100}%`;
      if (i < points.length - 1) {
        polygon_str += ",";
      }
    }
    polygon_str += ")";

    this.result_elem.style.clipPath = polygon_str;

    this.result_elem.innerHTML = "";
  }

  async get_poll_page() {
    let page = await fetch("poll/slide_poll.template.html");
    page = await page.text();
    page = page.replace("POLL_ID", this.id);
    return page;
  }

  is_valid_response(response) {
    return true;
  }
}

const poll_types = [SingleChoicePoll, SlidePoll];

function create_join_elem() {
  const link = get_poll_link();

  const join_elem = document.createElement("div");
  join_elem.classList.add("join-poll");
  join_elem.innerHTML = `
  Join at <code>${polli_live_url_human}</code> with <code class="session-id"></code>
  `;
  join_elem.addEventListener("click", open_settings);
  return join_elem;
}

function initialize_poll_instances() {
  const polls = [];
  for (const poll_type of poll_types) {
    for (const poll_container of document.getElementsByClassName(
      poll_type.class_name
    )) {
      polls.push(new poll_type(poll_container));
    }
  }
  return polls;
}

function find_poll_on_slide(slide) {
  for (const poll_type of poll_types) {
    for (const poll_container of slide.getElementsByClassName(
      poll_type.class_name
    )) {
      return get_poll_by_container(poll_container);
    }
  }
  return null;
}

function get_poll_by_container(container) {
  for (const poll of all_polls) {
    if (poll.container === container) {
      return poll;
    }
  }
  return null;
}

function get_poll_by_id(id) {
  for (const poll of all_polls) {
    if (poll.id === id) {
      return poll;
    }
  }
  return null;
}

function session_updated() {
  const new_link = get_poll_link();
  for (const session_id_elem of document.getElementsByClassName("session-id")) {
    if (current_session) {
      session_id_elem.innerText = current_session.session;
    } else {
      session_id_elem.innerText = "...";
    }
  }
  for (const settings_elem of document.getElementsByClassName(
    "polli-settings-container"
  )) {
    settings_elem.innerHTML = "";
    settings_elem.appendChild(make_settings_elem());
  }

  update_poll_qr_codes();
  for (const poll of all_polls) {
    update_poll_result(poll);
  }
  if (new_link) {
    const poll = find_poll_on_current_slide();
    if (poll) {
      start_poll(poll);
    }
  }
}

function open_settings() {
  const container_elem = document.createElement("div");
  container_elem.classList.add("polli-settings-container");
  container_elem.appendChild(make_settings_elem());

  Swal.fire({
    html: container_elem,
    background: "rgb(59 59 59)",
    confirmButtonText: "Close",
  });
}

function make_settings_elem() {
  const settings_elem = document.createElement("div");

  const new_session_elem = document.createElement("button");
  settings_elem.appendChild(new_session_elem);
  new_session_elem.innerText = "New Session";
  new_session_elem.addEventListener("click", on_new_session);

  const poll_link = get_poll_link();

  if (poll_link) {
    const qr_elem = document.createElement("div");
    settings_elem.appendChild(qr_elem);
    qr_elem.style.border = "1em solid transparent";
    qr_elem.style.backgroundColor = "white";
    qr_elem.style.borderRadius = "5px";
    qr_elem.style.width = "fit-content";
    qr_elem.style.height = "fit-content";
    qr_elem.style.marginLeft = "auto";
    qr_elem.style.marginRight = "auto";
    qr_elem.style.marginTop = "1em";
    const image = get_qr_code_image_data(poll_link, qrcode_size);
    update_qr_code_elem(qr_elem, image);

    const link_elem = document.createElement("a");
    settings_elem.appendChild(link_elem);
    link_elem.classList.add("settings-poll-link");
    link_elem.classList.add("join-poll");
    link_elem.style.fontSize = "larger";
    link_elem.href = poll_link;
    link_elem.target = "_blank";
    link_elem.innerHTML = `<code>${polli_live_url_human}</code> with <code class="session-id">${current_session.session}</code>`;
  } else {
    const error_elem = document.createElement("div");
    settings_elem.append(error_elem);
    error_elem.style.color = "white";
    error_elem.style.margin = "1em";
    error_elem.innerText = "No active session.";
  }

  return settings_elem;
}

async function start_poll(poll) {
  if (!current_session) {
    return;
  }

  const page = await poll.get_poll_page();
  await fetch(`${polli_live_url}/page?session=${current_session.session}`, {
    method: "POST",
    body: page,
    headers: {
      Authorization: "Bearer " + current_session.token,
    },
  });

  next_response_id = 0;
  start_getting_poll_results();
}

function start_poll_results_loop() {
  const handler = async () => {
    if (current_session) {
      if (do_poll_results.active) {
        await retrieve_new_poll_responses();
        update_poll_results_on_current_slide();
      }
    }
    setTimeout(handler, poll_interval_ms);
  };

  handler();
}

function start_getting_poll_results() {
  do_poll_results.active = true;
}

function stop_getting_poll_results() {
  do_poll_results.active = false;
}

function update_poll_results_on_current_slide() {
  const poll = find_poll_on_current_slide();
  if (!poll) {
    return;
  }
  update_poll_result(poll);
}

function find_poll_on_current_slide() {
  const current_slide = Reveal.getCurrentSlide();
  return find_poll_on_slide(current_slide);
}

async function retrieve_new_poll_responses() {
  if (!current_session) {
    return;
  }
  let responses;
  try {
    responses = await fetch(
      `${polli_live_url}/responses?session=${current_session.session}&start=${next_response_id}`
    );
  } catch (e) {
    console.error(e);
    return;
  }
  if (!responses.ok) {
    return;
  }
  responses = await responses.json();
  next_response_id = responses.next_start;

  for (const [user_id, response] of Object.entries(
    responses.responses_by_user
  )) {
    const { poll_id, data } = JSON.parse(response);
    global_responses.try_add_response(poll_id, user_id, data);
  }
  global_responses.store_in_local_storage();
}

async function update_poll_result(poll) {
  poll.update_with_responses(global_responses.responses_for_poll(poll.id));
}

function update_poll_qr_codes() {
  const link = get_poll_link();
  const elems = document.getElementsByClassName("polli-live-qr");
  if (link) {
    const image = get_qr_code_image_data(link, qrcode_size);
    for (const qr_code_elem of elems) {
      update_qr_code_elem(qr_code_elem, image);
    }
  } else {
    for (const qr_code_elem of elems) {
      qr_code_elem.innerHTML = "";
    }
  }
}

function update_qr_code_elem(qr_code_elem, image) {
  qr_code_elem.innerHTML = "";
  const canvas_elem = document.createElement("canvas");
  canvas_elem.style.display = "block";
  canvas_elem.width = qrcode_size;
  canvas_elem.height = qrcode_size;
  const ctx = canvas_elem.getContext("2d");
  ctx.putImageData(image, 0, 0);
  qr_code_elem.appendChild(canvas_elem);
}

function get_poll_link() {
  if (current_session) {
    return `${polli_live_url}/page?session=${current_session.session}`;
  }
  return null;
}

function get_qr_code_image_data(text, size) {
  const elem = document.createElement("div");
  new QRCode(elem, {
    text: text,
    width: size,
    height: size,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctionLevel: QRCode.CorrectLevel.L,
  });
  const canvas_elem = elem.children[0];
  const ctx = canvas_elem.getContext("2d");
  const image_data = ctx.getImageData(
    0,
    0,
    canvas_elem.width,
    canvas_elem.height
  );
  elem.remove();
  return image_data;
}

async function on_new_session() {
  await make_new_session();
  global_responses.clear();
  global_responses.store_in_local_storage();
  session_updated();
}

class PollResponses {
  constructor(local_storage_key, is_valid_response_fn) {
    this.local_storage_key = local_storage_key;
    this.is_valid_response_fn = is_valid_response_fn;
    this.responses_by_poll_id = new Map();
  }

  clear() {
    this.responses_by_poll_id.clear();
  }

  store_in_local_storage() {
    localStorage.setItem(this.local_storage_key, this.to_storage_string());
  }

  load_from_local_storage() {
    this.try_add_from_storage_string(
      localStorage.getItem(this.local_storage_key)
    );
  }

  to_storage_string() {
    const responses = [];
    for (const [
      poll_id,
      responses_by_user,
    ] of this.responses_by_poll_id.entries()) {
      for (const [user_id, data] of responses_by_user.entries()) {
        responses.push({ poll_id, user_id, data });
      }
    }
    return JSON.stringify(responses);
  }

  try_add_from_storage_string(storage_str) {
    try {
      const responses = JSON.parse(storage_str);
      for (const { poll_id, user_id, data } of responses) {
        this.add_response(poll_id, user_id, data);
      }
    } catch {}
  }

  try_add_response(poll_id, user_id, data) {
    if (!poll_id || !user_id || !data) {
      return;
    }
    if (!this.is_valid_response_fn(poll_id, data)) {
      return;
    }
    if (!this.responses_by_poll_id.has(poll_id)) {
      this.responses_by_poll_id.set(poll_id, new Map());
    }
    this.responses_by_poll_id.get(poll_id).set(user_id, data);
  }

  responses_for_poll(poll_id) {
    const responses = this.responses_by_poll_id.get(poll_id);
    if (responses) {
      return responses;
    }
    return new Map();
  }
}

function response_is_valid(poll_id, response_data) {
  const poll = get_poll_by_id(poll_id);
  if (!poll) {
    return false;
  }
  return poll.is_valid_response(response_data);
}

let do_poll_results = { active: false };
let all_polls = undefined;

let global_responses = new PollResponses(
  "polli_live_responses",
  response_is_valid
);

main();
