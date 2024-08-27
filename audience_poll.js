let server_url = "https://poll.jlucke.com";
// let server_url = "http://192.168.0.15:8080";
let session_id = localStorage.getItem("session_id") || "test";
let option_colors = ["#67B8DB", "#DB7873", "#9CDB67", "#DBA667"];
const qrcode_size = 256;
const poll_interval_ms = 500;

let responses_by_question_id = new Map();

function main() {
  load_responses_from_local_storage();

  const polls_containers =
    document.getElementsByClassName("poll-single-choice");
  for (const poll_container of polls_containers) {
    build_single_choice_poll(poll_container);
  }
  update_poll_qr_codes();

  Reveal.on("slidechanged", async function (event) {
    stop_getting_poll_results();
    const current_slide = event.currentSlide;
    const poll_container = current_slide.querySelector(".poll-single-choice");
    if (!poll_container) {
      return;
    }
    await on_start_single_choice_poll(poll_container);
  });
}

function build_single_choice_poll(poll_container) {
  const options = [];
  for (const option_elem of poll_container.children) {
    options.push(option_elem.innerText);
  }

  const hide_results = poll_container.hasAttribute("data-hide-result");

  poll_container.innerHTML = "";
  poll_container.poll_options = options;
  poll_container.results_revealed = !hide_results;

  const poll_link = get_poll_link();

  if (hide_results) {
    const options_container = document.createElement("div");
    poll_container.appendChild(options_container);
    poll_container.options_container = options_container;
    options_container.classList.add("options-container");

    for (const option_i in options) {
      const option = options[option_i];
      const option_elem = document.createElement("div");
      options_container.appendChild(option_elem);
      option_elem.classList.add("option-elem");
      option_elem.innerText = option;
      option_elem.style.backgroundColor = option_colors[option_i];
    }
  }

  const result_elem = document.createElement("div");
  poll_container.appendChild(result_elem);
  poll_container.result_elem = result_elem;

  const join_elem = document.createElement("div");
  poll_container.appendChild(join_elem);
  join_elem.classList.add("join-poll");
  join_elem.innerHTML = `Join at <code>${poll_link}</code>`;
  join_elem.addEventListener("click", open_settings);

  update_poll_result(poll_container);
}

function set_new_session_id(new_session_id) {
  session_id = new_session_id;
  localStorage.setItem("session_id", session_id);
  update_poll_qr_codes();
}

function update_poll_page(page_str) {
  fetch(`${get_poll_link()}/set_page`, {
    method: "POST",
    body: page_str,
  });
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
  link_elem.href = get_poll_link();
  link_elem.target = "_blank";
  link_elem.innerText = get_poll_link();

  Swal.fire({
    html: settings_elem,
    background: "rgb(59 59 59)",
    confirmButtonText: "Close",
  });
}

async function on_start_single_choice_poll(poll_container) {
  const question_id = poll_container.id;
  const options = poll_container.poll_options;
  const result_elem = poll_container.result_elem;
  let template = await fetch("poll.template.html");
  template = await template.text();
  template = template.replace("QUESTION_ID", question_id);
  template = template.replace(
    '"MULTIPLE_CHOICE_OPTIONS"',
    JSON.stringify(options)
  );
  template = template.replace(
    '"MULTIPLE_CHOICE_COLORS"',
    JSON.stringify(option_colors)
  );
  update_poll_page(template);
  start_getting_poll_results();
  poll_results_loop();
}

function poll_results_loop() {
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
  const current_slide = Reveal.getCurrentSlide();
  const poll_container = current_slide.querySelector(".poll-single-choice");
  if (!poll_container) {
    return;
  }
  update_poll_result(poll_container);
}

async function retrieve_new_poll_responses() {
  let responses = await fetch(`${get_poll_link()}/responses`);
  if (!responses.ok) {
    return;
  }
  responses = await responses.json();

  for (const [user_id, response] of Object.entries(responses)) {
    const { question_id, data } = JSON.parse(response);
    const poll_container = document.getElementById(question_id);
    if (!poll_container) {
      continue;
    }
    if (!data) {
      continue;
    }
    if (!poll_container.poll_options.includes(data)) {
      continue;
    }
    add_response_to_global_map({ question_id, user_id, data });
  }
  store_responses_in_local_storage();
}

async function update_poll_result(poll_container) {
  const result_elem = poll_container.result_elem;
  const question_id = poll_container.id;
  const valid_options = poll_container.poll_options;

  // Clear old results.
  result_elem.innerHTML = "";

  let responses_num = 0;
  const count_by_option = new Map();
  for (const option of valid_options) {
    count_by_option.set(option, 0);
  }

  let question_responses = responses_by_question_id.get(question_id);
  if (question_responses) {
    for (const [
      user_id,
      choosen_option,
    ] of question_responses.response_by_user.entries()) {
      if (!valid_options.includes(choosen_option)) {
        continue;
      }
      responses_num += 1;
      count_by_option.set(
        choosen_option,
        count_by_option.get(choosen_option) + 1
      );
    }
  }

  const sorted_options = [...valid_options];
  if (poll_container.hasAttribute("data-hide-result")) {
    // Sort by count in case the results should be hidden initially.
    // Otherwise, it's obvious which bar corresponds to which option.
    sorted_options.sort(
      (a, b) => count_by_option.get(b) - count_by_option.get(a)
    );
  }

  for (const option of sorted_options) {
    const option_i = valid_options.indexOf(option);
    const count = count_by_option.get(option);
    const option_elem = document.createElement("div");
    option_elem.classList.add("poll-bar");
    result_elem.appendChild(option_elem);

    const percentage = (count / Math.max(1, responses_num)) * 100;
    option_elem.style.width = `${percentage * 0.9}%`;

    if (poll_container.results_revealed) {
      option_elem.innerText = `${option}: ${count}`;
      option_elem.style.backgroundColor = option_colors[option_i];
    } else {
      option_elem.innerText = `${count}`;
    }

    option_elem.addEventListener("click", async () => {
      poll_container.results_revealed = true;
      poll_container.options_container.style.display = "None";
      await update_poll_result(poll_container);
    });
  }
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

main();

let do_poll_results = { active: false };
