const API_URL = "http://4.224.186.213/evaluation-service/notifications";


const TOKEN = "Your_Bearer_Token_Here";


const weights = {
  Placement: 3,
  Result: 2,
  Event: 1
};

async function getPriorityNotifications() {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    const notifications = data.notifications || [];

    const sortedNotifications = notifications.sort((a, b) => {
      const weightDiff =
        (weights[b.Type] || 0) - (weights[a.Type] || 0);

      if (weightDiff !== 0) {
        return weightDiff;
      }

      return (
        new Date(b.Timestamp).getTime() -
        new Date(a.Timestamp).getTime()
      );
    });

    console.log("\nTOP 10 PRIORITY NOTIFICATIONS\n");

    sortedNotifications
      .slice(0, 10)
      .forEach((notification, index) => {
        console.log(
          `${index + 1}. ${notification.Type} | ${notification.Message} | ${notification.Timestamp}`
        );
      });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

getPriorityNotifications();