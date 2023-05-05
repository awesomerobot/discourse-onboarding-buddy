import Component from "@glimmer/component";
import { inject as service } from "@ember/service";
import { action } from "@ember/object";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";

export default class YourComponent extends Component {
  @service currentUser;
  @tracked updatedName;
  @tracked saved;

  @action
  updateName(change) {
    this.updatedName = change.target.value;
  }

  @action
  save() {
    this.saved = false;

    return ajax(`/u/${this.currentUser.username}.json`, {
      type: "PUT",
      data: { name: this.updatedName },
    })
      .then((response) => {
        this.saved = true;
        const localStorageKey = `fullProfile_${this.currentUser.username}`;
        const userDataWithTimestamp = {
          userData: response.user,
          timestamp: new Date().getTime(),
        };
        localStorage.setItem(
          localStorageKey,
          JSON.stringify(userDataWithTimestamp)
        );
      })
      .catch((error) => {
        console.error("Error updating name:", error);
        this.saved = false;
      });
  }
}
