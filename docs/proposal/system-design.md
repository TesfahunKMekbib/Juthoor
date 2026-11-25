# Initial project proposal — section 2, System Design (verbatim extract)

Source: `Capstone Project A - Initial Project Proposal Final 2.pdf` (team proposal, outside the repo), section 2.
Diagram: [architecture-diagram.jpg](architecture-diagram.jpg). Reference document — approved requirements and accepted ADRs take precedence (CLAUDE.md).

```text
2. System Design
The proposed system follows a layered microservices architecture, in which the backend is
divided into independent services each responsible for a specific business capability. The core
Backend is designed as platform-independent, which its functionalities are exposed through
an API Gate way. The architecture consists of four main layers namely Client Layer, API
Gateway, backend microservices and Data and external services as shown in the diagram
below.

    Client layer: The Client Layer provides the interfaces through which users interact with
       Juthoor. Through the client interface, users can create and manage their profiles, record
       sustainability activities, provide supporting evidence, view their contribution history and
       achievements, monitor rewards, participate in environmental challenges and campaigns,
       view rankings, and monitor their environmental impact. This layer communicates to the
       backend through an API Gateway.

    API Gateway: This layer is the main entry point to the backend microservices. Requests
       from client layer pass through the gateway, which forwards them to the appropriate
       service in the backend. This gateway is responsible for request routing, authentication
       and authorization enforcement, API security, and rate limiting. It provides a consistent

    interface for the clients to communicate with the Juthoor backend as well as allows the
    internal microservices to evolve independently.

 Backend Microservices layer: The core functionality of Juthoor is divided into
    independent microservices according to the main business capabilities of the system.
    The backend includes, but not limited to, the following services.

     1. Identity and User Service: manages user accounts, profiles, roles, authentication-
          related information, and user preferences.

     2. Activity Service: manages sustainability activities and user submissions. Activity
          records include information such as the activity type, description, date, location,
          supporting evidence, verification status, and associated environmental impact
          information, as required by the project idea.

     3. Verification Service: manages the process of validating submitted sustainability
          activities and their supporting evidence. It may use automated or AI-assisted
          verification and can support manual review when necessary.

     4. Rewards Service: manages the platform's gamification and recognition
          mechanisms, including reward points, achievement badges, sustainability levels,
          and other forms of recognition. The project specifically requires rewards to consider
          factors such as participation, consistency, environmental impact, and community
          involvement.

     5. Campaign and Challenge: Service manages sustainability challenges,
          environmental campaigns, participation, and organized community initiatives.

     6. Environmental Impact: Service calculates and maintains environmental impact
          resulting from verified activities. Depending on the activity, this may include
          measures such as trees planted, waste recycled, estimated carbon emissions
          reduced, water conserved, and energy saved.

     7. Community and Leaderboard: Service manages community-oriented features such
          as rankings, leaderboards, team participation, and collective progress.

     8. Notification Service: is responsible for notifying users about important events such
          as verification results, earned achievements, campaign updates, and challenge
          progress.

 Data and Storage layer: In the data layer, each service is responsible for the information
    belonging to its business domain preventing allowance of all services to directly modify
    one shared database. For example, the User Service owns user-related data, the Activity
    Service owns activity records, the Rewards Service owns reward information, and the

    Impact Service owns environmental-impact records. Supporting evidence such as activity
    photographs is stored separately using object storage, while the corresponding activity
    and evidence metadata is maintained by the appropriate backend service.
 External Services and AI Integration: Juthoor may integrate with external services for
    capabilities such as maps and geolocation, email or push notifications, and artificial
    intelligence. AI functionality is integrated with the relevant microservices. For example,
    the Verification Service can use an AI component to assess whether submitted
    photographic evidence corresponds to the claimed sustainability activity.

```
