import Component from "@glimmer/component";
import { inject as service } from "@ember/service";
import { action } from "@ember/object";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";

export default class YourComponent extends Component {
  @service currentUser;
  @tracked updatedBio;
  @tracked saved;
  @tracked isSaving;
  @tracked submitDisabled = true;

  @action
  updateBio(change) {
    this.updatedBio = change.target.value;
    this.submitDisabled = this.updatedBio.length === 0;
  }

  @action
  save() {
    this.saved = false;
    this.isSaving = true;

    return ajax(`/u/${this.currentUser.username}.json`, {
      type: "PUT",
      data: { bio_raw: this.updatedBio },
    })
      .then((response) => {
        this.saved = true;
        this.isSaving = false;

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
        console.error("Error updating bio:", error);
        this.saved = false;
      });
  }
}
