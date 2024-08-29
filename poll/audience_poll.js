let server_url = "https://poll.jlucke.com";
// let server_url = "http://192.168.0.15:8080";
let session_id = localStorage.getItem("session_id") || "test";
let option_colors = ["#67B8DB", "#DB7873", "#9CDB67", "#DBA667"];
const qrcode_size = 256;
const poll_interval_ms = 500;

let responses_by_question_id = new Map();

function main() {
  load_responses_from_local_storage();

  all_polls = initialize_poll_instances();
  for (const poll of all_polls) {
    poll.initialize();
    poll.update_with_responses(new Map());
  }

  update_poll_qr_codes();
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
        option_elem.innerHTML = `${option_html}`;
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
    page = page.replace("QUESTION_ID", this.id);
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

  is_valid_resonse(response) {
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
    page = page.replace("QUESTION_ID", this.id);
    return page;
  }

  is_valid_resonse(response) {
    return true;
  }
}

const poll_types = [SingleChoicePoll, SlidePoll];

function create_join_elem() {
  const join_elem = document.createElement("div");
  const link_elem = document.createElement("code");
  link_elem.innerText = get_poll_link();
  link_elem.classList.add("join-link-elem");
  join_elem.classList.add("join-poll");
  join_elem.appendChild(document.createTextNode("Join at "));
  join_elem.appendChild(link_elem);
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

function set_new_session_id(new_session_id) {
  session_id = new_session_id;
  localStorage.setItem("session_id", session_id);
  const new_link = get_poll_link();
  for (const link_elem of document.getElementsByClassName("join-link-elem")) {
    link_elem.innerText = new_link;
    if (link_elem.tagName === "a") {
      link_elem.href = new_link;
    }
  }
  update_poll_qr_codes();
  const poll = find_poll_on_current_slide();
  if (poll) {
    start_poll(poll);
  }
}

function open_settings() {
  const settings_elem = document.createElement("div");

  const session_id_elem = document.createElement("input");
  settings_elem.appendChild(session_id_elem);
  session_id_elem.value = session_id;
  session_id_elem.addEventListener("change", () => {
    set_new_session_id(session_id_elem.value);
  });

  const reset_responses_elem = document.createElement("button");
  settings_elem.appendChild(reset_responses_elem);
  reset_responses_elem.innerText = "Reset Responses";
  reset_responses_elem.addEventListener("click", reset_responses);

  const qr_elem = document.createElement("div");
  settings_elem.appendChild(qr_elem);
  qr_elem.classList.add("poll-qr-code");
  const image = get_qr_code_image_data(get_poll_link(), qrcode_size);
  update_qr_code_elem(qr_elem, image);

  const link_elem = document.createElement("a");
  settings_elem.appendChild(link_elem);
  link_elem.classList.add("settings-poll-link");
  link_elem.classList.add("join-link-elem");
  link_elem.href = get_poll_link();
  link_elem.target = "_blank";
  link_elem.innerText = get_poll_link();

  Swal.fire({
    html: settings_elem,
    background: "rgb(59 59 59)",
    confirmButtonText: "Close",
  });
}

async function start_poll(poll) {
  const page = await poll.get_poll_page();
  await fetch(`${get_poll_link()}/set_page`, {
    method: "POST",
    body: page,
  });

  start_getting_poll_results();
}

function start_poll_results_loop() {
  const handler = async () => {
    if (do_poll_results.active) {
      await retrieve_new_poll_responses();
      update_poll_results_on_current_slide();
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
  let responses = await fetch(`${get_poll_link()}/responses`);
  if (!responses.ok) {
    return;
  }
  responses = await responses.json();

  for (const [user_id, response] of Object.entries(responses)) {
    const { question_id, data } = JSON.parse(response);
    const poll = get_poll_by_id(question_id);
    if (!poll) {
      continue;
    }
    if (!data) {
      continue;
    }
    if (!poll.is_valid_resonse(data)) {
      continue;
    }
    add_response_to_global_map({ question_id, user_id, data });
  }
  store_responses_in_local_storage();
}

async function update_poll_result(poll) {
  const question_responses = responses_by_question_id.get(poll.id);
  const responses_by_user = question_responses
    ? question_responses.response_by_user
    : new Map();
  poll.update_with_responses(responses_by_user);
}

function update_poll_qr_codes() {
  const image = get_qr_code_image_data(get_poll_link(), qrcode_size);
  for (const qr_code_elem of document.getElementsByClassName("poll-qr-code")) {
    update_qr_code_elem(qr_code_elem, image);
  }
}

function update_qr_code_elem(qr_code_elem, image) {
  qr_code_elem.innerHTML = "";
  const canvas_elem = document.createElement("canvas");
  canvas_elem.width = qrcode_size;
  canvas_elem.height = qrcode_size;
  const ctx = canvas_elem.getContext("2d");
  ctx.putImageData(image, 0, 0);
  qr_code_elem.appendChild(canvas_elem);
}

function get_poll_link() {
  return `${server_url}/s/${session_id}`;
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

function load_responses_from_local_storage() {
  let all_responses = localStorage.getItem("all_responses");
  if (!all_responses) {
    return;
  }
  all_responses = JSON.parse(all_responses);
  for (const response of all_responses) {
    add_response_to_global_map(response);
  }
}

function store_responses_in_local_storage() {
  responses = [];
  for (const [
    question_id,
    { response_by_user },
  ] of responses_by_question_id.entries()) {
    for (const [user_id, response_data] of response_by_user.entries()) {
      responses.push({ question_id, user_id, data: response_data });
    }
  }
  localStorage.setItem("all_responses", JSON.stringify(responses));
}

async function reset_responses() {
  await fetch(`${get_poll_link()}/reset_responses`, {
    method: "POST",
  });
  responses_by_question_id = new Map();
  store_responses_in_local_storage();
}

function add_response_to_global_map(response) {
  const question_id = response.question_id;
  const user_id = response.user_id;
  const response_data = response.data;

  if (!question_id || !user_id || !response_data) {
    return;
  }

  if (!responses_by_question_id.has(question_id)) {
    responses_by_question_id.set(question_id, {
      response_by_user: new Map(),
    });
  }

  const question_responses = responses_by_question_id.get(question_id);
  question_responses.response_by_user.set(user_id, response_data);
}

let do_poll_results = { active: false };
let all_polls = undefined;

main();
