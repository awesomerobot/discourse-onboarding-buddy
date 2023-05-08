import Component from "@glimmer/component";
import { action } from "@ember/object";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";
import { inject as service } from "@ember/service";
import { userPath } from "discourse/lib/url";

export default class OnboardingUnfilledUserFields extends Component {
  @service currentUser;
  @tracked submitDisabled = true;
  @tracked saved;

  @action
  uploadComplete() {
    this.submitDisabled = false;
  }

  @action
  save() {
    this.saved = false;
    this.isSaving = true;
    const selectedUploadId = this.args.fullProfile.custom_avatar_upload_id;
    const uploadType = "custom";

    return ajax(
      userPath(
        `${this.args.fullProfile.username.toLowerCase()}/preferences/avatar/pick`
      ),
      {
        type: "PUT",
        data: { upload_id: selectedUploadId, type: uploadType },
      }
    )
      .then(() => {
        this.saved = true;
        this.isSaving = false;
        window.location.reload();
      })
      .catch((error) => {
        console.error("Error updating bio:", error);
        this.saved = false;
      });
  }
}
