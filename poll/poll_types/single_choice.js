const polli_live_plugin_single_choice = (function () {
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
        this.options_container.style.display = "flex";

        for (let option_i = 0; option_i < this.options.length; option_i++) {
          const option_elem = document.createElement("div");
          this.options_container.appendChild(option_elem);
          option_elem.innerHTML = this.options_html[option_i];
          option_elem.style.cssText = `
            background-color: ${this.option_colors[option_i]};
            border-radius: 0.3em;
            width: fit-content;
            margin-left: 1em;
            padding: 0.3em;
            font-size: 70%;
            text-shadow: black 0 0 2px;
          `;
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
        this.result_elem.appendChild(option_elem);

        option_elem.style.cssText = `
          min-width: 2em;
          text-align: left;
          padding-left: 0.5em;
          white-space: nowrap;
          margin: 0.3em;
          border-radius: 0.3em;
          overflow: visible;
          textShadow: black 0 0 2px;
          cursor: pointer;
        `;

        const percentage = (count / Math.max(1, responses_num)) * 100;
        option_elem.style.width = `${percentage * 0.9}%`;

        if (this.results_revealed) {
          option_elem.innerHTML = `${option_html}: ${count}`;
          option_elem.style.backgroundColor = this.option_colors[option_i];
        } else {
          option_elem.innerHTML = `${count}`;
          option_elem.style.backgroundColor = "#464646";
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

  polli_live.register_poll_type(SingleChoicePoll);
})();
