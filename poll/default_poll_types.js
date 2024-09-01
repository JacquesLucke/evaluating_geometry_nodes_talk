const polli_default_polls = (function () {
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

      const join_elem = polli_live.create_join_elem();
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

      const join_elem = polli_live.create_join_elem();
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

  polli_live.register_poll_type(SingleChoicePoll);
  polli_live.register_poll_type(SlidePoll);

  return {
    SingleChoicePoll,
    SlidePoll,
  };
})();
