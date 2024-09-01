const polli_live = (function () {
  let polli_live_url_human = "polli.live";

  const qrcode_size = 256;
  const poll_interval_ms = 100;

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
      this.option_colors = ["#67B8DB", "#DB7873", "#9CDB67", "#DBA667"];

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
          option_elem.style.backgroundColor = this.option_colors[option_i];
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
          option_elem.style.backgroundColor = this.option_colors[option_i];
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
        JSON.stringify(this.option_colors)
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
          this.try_add_response(poll_id, user_id, data);
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

  class Polls {
    constructor(poll_types) {
      this.poll_types = poll_types;
      this.polls = [];
    }

    gather(root_elem) {
      for (const poll_type of this.poll_types) {
        for (const poll_container of root_elem.getElementsByClassName(
          poll_type.class_name
        )) {
          this.polls.push(new poll_type(poll_container));
        }
      }
    }

    initialize_all(responses) {
      for (const poll of this.polls) {
        poll.initialize();
      }
      this.update_all(responses);
    }

    update_all(responses) {
      for (const poll of this.polls) {
        poll.update_with_responses(responses.responses_for_poll(poll.id));
      }
    }

    update(poll, responses) {}

    by_container(poll_container) {
      for (const poll of this.polls) {
        if (poll.container === poll_container) {
          return poll;
        }
      }
      return null;
    }

    by_id(poll_id) {
      for (const poll of this.polls) {
        if (poll.id === poll_id) {
          return poll;
        }
      }
      return null;
    }

    by_parent(parent_elem) {
      for (const poll_type of this.poll_types) {
        for (const poll_container of parent_elem.getElementsByClassName(
          poll_type.class_name
        )) {
          return this.by_container(poll_container);
        }
      }
      return null;
    }
  }

  function response_is_valid(poll_id, response_data) {
    const poll = globals.polls.by_id(poll_id);
    if (!poll) {
      return false;
    }
    return poll.is_valid_response(response_data);
  }

  class PolliLiveConnection {
    constructor(
      url,
      responses,
      local_storage_key,
      on_session_change,
      on_response_change
    ) {
      this.url = url;
      this.responses = responses;
      this.local_storage_key = local_storage_key;
      this.on_session_change = on_session_change;
      this.on_response_change = on_response_change;
      this.session = null;
      this.token = null;
      this.next_response = 0;
      this.should_fetch_responses = false;
      this.#start_fetch_responses_loop();
    }

    get has_session() {
      return this.session !== null;
    }

    get poll_link() {
      if (this.session) {
        return `${this.url}/page?session=${this.session}`;
      }
      return null;
    }

    async init_session() {
      this.session = null;
      this.token = null;
      this.next_response = 0;
      try {
        let desired_session = localStorage.getItem(this.local_storage_key);
        const res = await fetch(`${this.url}/new`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: desired_session,
        });
        if (res.ok) {
          const new_session = await res.json();
          localStorage.setItem(
            this.local_storage_key,
            JSON.stringify(new_session)
          );
          this.session = new_session.session;
          this.token = new_session.token;
          return;
        }
      } finally {
        this.on_session_change();
      }
      console.error(`Could not initialize session on ${this.url}.`);
    }

    async make_new_session() {
      localStorage.removeItem(this.local_storage_key);
      await this.init_session();
    }

    async set_page(page) {
      if (!this.session || !this.token) {
        return;
      }
      try {
        const res = await fetch(`${this.url}/page?session=${this.session}`, {
          method: "POST",
          body: page,
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
        if (res.ok) {
          return;
        }
      } catch {}
      console.error(`Could not set poll page.`);
    }

    start_fetching_responses() {
      this.should_fetch_responses = true;
    }

    stop_fetching_responses() {
      this.should_fetch_responses = false;
    }

    #start_fetch_responses_loop() {
      const handler = async () => {
        try {
          if (!this.session) {
            return;
          }
          if (!this.should_fetch_responses) {
            return;
          }
          if (await this.#fetch_new_responses()) {
            this.on_response_change();
          }
        } finally {
          setTimeout(handler, poll_interval_ms);
        }
      };

      handler();
    }

    async #fetch_new_responses() {
      if (!this.session) {
        return false;
      }

      try {
        let responses = await fetch(
          `${this.url}/responses?session=${this.session}&start=${this.next_response}`
        );
        if (!responses.ok) {
          return false;
        }
        responses = await responses.json();
        this.next_response = responses.next_start;

        let found_new_responses = false;
        for (const [user_id, response] of Object.entries(
          responses.responses_by_user
        )) {
          const { poll_id, data } = JSON.parse(response);
          this.responses.try_add_response(poll_id, user_id, data);
          found_new_responses = true;
        }
        return found_new_responses;
      } catch {}
      return false;
    }
  }

  function main(options) {
    globals.polls = new Polls([SingleChoicePoll, SlidePoll]);
    globals.responses = new PollResponses(
      "polli_live_responses",
      response_is_valid
    );
    globals.connection = new PolliLiveConnection(
      options.server,
      globals.responses,
      "polli-live",
      polli_live_session_changed,
      polli_live_has_new_responses
    );

    setTimeout(async () => {
      await globals.connection.init_session();
    }, 0);

    globals.polls.gather(document);

    // Old responses are stored in local storage so that they are still available
    // after a reload.
    globals.responses.load_from_local_storage();

    globals.polls.initialize_all(globals.responses);

    Reveal.on("slidechanged", async function (event) {
      globals.connection.stop_fetching_responses();
      const poll = find_poll_on_current_slide();
      if (poll) {
        await start_poll(poll);
      }
    });
  }

  function create_join_elem() {
    const join_elem = document.createElement("div");
    join_elem.classList.add("join-poll");
    join_elem.innerHTML = `
  Join at <code>${polli_live_url_human}</code> with <code class="session-id"></code>
  `;
    join_elem.addEventListener("click", open_settings);
    return join_elem;
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
    new_session_elem.addEventListener("click", async () => {
      globals.responses.clear();
      globals.responses.store_in_local_storage();
      await globals.connection.make_new_session();
    });

    if (globals.connection.has_session) {
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
      const image = get_qr_code_image_data(
        globals.connection.poll_link,
        qrcode_size
      );
      update_qr_code_elem(qr_elem, image);

      const link_elem = document.createElement("a");
      settings_elem.appendChild(link_elem);
      link_elem.classList.add("settings-poll-link");
      link_elem.classList.add("join-poll");
      link_elem.style.fontSize = "larger";
      link_elem.href = globals.connection.poll_link;
      link_elem.target = "_blank";
      link_elem.innerHTML = `<code>${polli_live_url_human}</code> with <code class="session-id">${globals.connection.session}</code>`;
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
    const page = await poll.get_poll_page();
    await globals.connection.set_page(page);
    globals.connection.start_fetching_responses();
  }

  function find_poll_on_current_slide() {
    const current_slide = Reveal.getCurrentSlide();
    return globals.polls.by_parent(current_slide);
  }

  function update_poll_qr_codes() {
    const elems = document.getElementsByClassName("polli-live-qr");
    if (globals.connection.has_session) {
      const image = get_qr_code_image_data(
        globals.connection.poll_link,
        qrcode_size
      );
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

  function polli_live_session_changed() {
    for (const session_id_elem of document.getElementsByClassName(
      "session-id"
    )) {
      if (globals.connection.has_session) {
        session_id_elem.innerText = globals.connection.session;
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
    globals.polls.update_all(globals.responses);
    if (globals.connection.has_session) {
      const poll = find_poll_on_current_slide();
      if (poll) {
        start_poll(poll);
      }
    }
  }

  function polli_live_has_new_responses() {
    globals.responses.store_in_local_storage();
    const poll = find_poll_on_current_slide();
    if (poll) {
      poll.update_with_responses(globals.responses.responses_for_poll(poll.id));
    }
  }

  const globals = {};

  return {
    initialize: main,
  };
})();
