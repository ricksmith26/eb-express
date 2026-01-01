import Agenda from 'agenda';
import CalendarController from '../controllers/calendar-controller.js'
import User from '../models/User.js';
import BrigidCalendarEvent from '../models/BrigidCalendarEvent.js';
import { getPreferredSocketId } from '../socketIo/socketIo.js';
import {io as IO} from '../app.js'
import moment from 'moment';
import { WithingsService } from '../services/WithingsService.js';
import brigidCalendarService from '../services/brigid-calendar-service.js';
import { sendEventReminderNotification } from '../services/pushNotificationService.js';
import {
    WITHINGS_CLIENT_ID,
    WITHINGS_CLIENT_SECRET,
    WITHINGS_CALLBACK_URL
} from '../config/vars.js';
// import { users } from './userStore'; // a list of registered user emails

const mongoConnectionString = process.env.MONGO_DB_URL;
const agenda = new Agenda({ db: { address: mongoConnectionString, collection: 'agendaJobs' } ,processEvery: '5 seconds'});

export const isAlreadyScheduled = async (agenda, email, event) => {
    const existingJobs = await agenda.jobs({
        name: 'notify user of event',
        'data.email': email,
        'data.event.id': event.id
    });
    return existingJobs.length > 0;
};

/**
 * Schedule or update a calendar event in Agenda
 * This function is called by the webhook when a calendar is updated
 */
export const scheduleCalendarEvent = async (email, event) => {
    try {
        if (!event.start || !event.start.dateTime) {
            console.log(`⚠️ Skipping event without dateTime: ${event.summary}`);
            return;
        }

        const eventStartTime = new Date(event.start.dateTime);
        const now = new Date();

        // Only schedule future events
        if (eventStartTime <= now) {
            console.log(`⚠️ Skipping past event: ${event.summary}`);
            return;
        }

        // Check if event is already scheduled
        if (await isAlreadyScheduled(agenda, email, event)) {
            console.log(`ℹ️ Event already scheduled: ${event.summary} for ${email}`);

            // Update existing job if event time has changed
            const existingJobs = await agenda.jobs({
                name: 'notify user of event',
                'data.email': email,
                'data.event.id': event.id
            });

            for (const job of existingJobs) {
                const existingTime = new Date(job.attrs.data.event.start.dateTime);
                if (existingTime.getTime() !== eventStartTime.getTime()) {
                    // Event time changed, remove old job and create new one
                    await job.remove();
                    await agenda.schedule(eventStartTime, 'notify user of event', { email, event });
                    console.log(`✅ Updated event schedule: ${event.summary} for ${email}`);
                }
            }
            return;
        }

        // Schedule new event
        await agenda.schedule(eventStartTime, 'notify user of event', { email, event });
        console.log(`✅ Scheduled new event: ${event.summary} for ${email} at ${eventStartTime}`);
    } catch (error) {
        console.error(`❌ Error scheduling event for ${email}:`, error);
        throw error;
    }
};

export const setupAgenda = async (io) => {

    agenda.define('test' , async(job) => {
        console.log('this is a test log')
    })

    agenda.define('notify user of event', async (job) => {
        console.log(job, job.attrs.data.event, '<<<<JOB')
        const { email, event } = job.attrs.data;
        console.log(email, {
            title: event.summary,
            time: event.start.dateTime
        },'<<<<notify user of event<<')
        try {
            // Use priority routing to get preferred socket ID (web first, then mobile)
            const recipientSocketId = getPreferredSocketId(email);
            if (recipientSocketId) {
                console.log('sending to:', recipientSocketId)
                IO.to(recipientSocketId).emit('eventNotification', {
                    title: event.summary,
                    time: moment(event.start.dateTime).format('LT')
                });
            } else {
                console.log(`User ${email} is not connected`);
            }
        } catch (error) {
            console.log(error)
            throw error
        }
    });

    agenda.define('schedule daily events', async () => {
        console.log('getting users')
        const users = await User.find()
        console.log(users, '<<USERS<<<<')
        let errors = 0
        for (const user of users) {
            try {
                console.log(user.email, '<<<<')
                // if (user.email === 'ricksmith69@gmail.com') {
                    const events = await CalendarController.getTodayEventsData(user);
                    for (const event of events) {
                        console.log(event.summary, moment(event.start.dateTime).format('LT'), (await isAlreadyScheduled(agenda, user.email, event)))
                        if (!(await isAlreadyScheduled(agenda, user.email, event))) {
                            try {
                                console.log(`scheduling: ${event.summary}`)
                                await agenda.schedule(new Date(event.start.dateTime), 'notify user of event', { email: user.email, event });
                            } catch (err) {
                                console.error(`❌ Failed to schedule event for ${user.email}:`, err);
                            }
                        }
                    // }
                }
            } catch (error) {
                errors += 1

                console.log(error, errors, '<<ERRORS<', user.email)
            }

        }
    });

    /**
     * Withings Daily Sync Job
     * Runs every 24 hours to sync health data for all connected users
     */
    agenda.define('withings-daily-sync', async (job) => {
        console.log('🔄 [Agenda] Starting Withings daily sync...');

        try {
            // Find all users with active Withings connections
            const users = await User.find({
                withingsAccessToken: { $exists: true, $ne: null }
            }).select('+withingsAccessToken +withingsRefreshToken');

            console.log(`📊 [Agenda] Found ${users.length} users with Withings connected`);

            let successCount = 0;
            let errorCount = 0;

            for (const user of users) {
                try {
                    console.log(`🔄 [Agenda] Syncing Withings data for: ${user.email}`);

                    const service = new WithingsService({
                        clientId: WITHINGS_CLIENT_ID,
                        clientSecret: WITHINGS_CLIENT_SECRET,
                        callbackUrl: WITHINGS_CALLBACK_URL,
                        accessToken: user.withingsAccessToken,
                        refreshToken: user.withingsRefreshToken,
                        tokenExpiry: user.withingsTokenExpiry
                    });

                    // Fetch last 30 days of data
                    const endDate = new Date();
                    const startDate = new Date();
                    startDate.setDate(startDate.getDate() - 30);

                    // Fetch all data types in parallel
                    const [measurements, activity, sleep] = await Promise.all([
                        service.getMeasurements([1, 6, 9, 10, 11, 76, 77, 88], startDate, endDate)
                            .catch(err => {
                                console.error(`❌ [Agenda] Failed to fetch measurements for ${user.email}:`, err.message);
                                return { measurements: [] };
                            }),
                        service.getActivity(startDate, endDate)
                            .catch(err => {
                                console.error(`❌ [Agenda] Failed to fetch activity for ${user.email}:`, err.message);
                                return [];
                            }),
                        service.getSleep(startDate, endDate)
                            .catch(err => {
                                console.error(`❌ [Agenda] Failed to fetch sleep for ${user.email}:`, err.message);
                                return [];
                            })
                    ]);

                    // Update last sync time
                    user.withingsLastSync = new Date();

                    // Update token if it was refreshed
                    if (service.token !== user.withingsAccessToken) {
                        user.withingsAccessToken = service.token;
                        user.withingsRefreshToken = service.refreshToken;
                        user.withingsTokenExpiry = new Date(service.tokenExpiry);
                        console.log(`🔄 [Agenda] Token refreshed for ${user.email}`);
                    }

                    await user.save();

                    console.log(`✅ [Agenda] Synced Withings data for ${user.email}: ${measurements.measurements.length} measurements, ${activity.length} activity days, ${sleep.length} sleep nights`);
                    successCount++;

                } catch (error) {
                    errorCount++;
                    console.error(`❌ [Agenda] Failed to sync Withings data for ${user.email}:`, error.message);

                    // If token is invalid (error 295, 294), clear Withings connection
                    if (error.message.includes('295') || error.message.includes('294')) {
                        console.log(`⚠️ [Agenda] Clearing invalid Withings connection for ${user.email}`);
                        user.withingsAccessToken = undefined;
                        user.withingsRefreshToken = undefined;
                        user.withingsTokenExpiry = undefined;
                        await user.save();
                    }
                }
            }

            console.log(`✅ [Agenda] Withings daily sync completed: ${successCount} successful, ${errorCount} errors`);

        } catch (error) {
            console.error('❌ [Agenda] Withings daily sync job failed:', error);
            throw error;
        }
    });

    /**
     * Brigid Calendar Reminder Job
     * Triggered at the scheduled reminder time for each event
     */
    agenda.define('brigid-calendar-reminder', async (job) => {
        const {
            eventId,
            reminderId,
            ownerEmail,
            inviteeEmails,
            eventTitle,
            eventStartTime,
            method
        } = job.attrs.data;

        console.log(`🔔 [Agenda] Brigid calendar reminder for event: ${eventId}`);

        try {
            const event = await BrigidCalendarEvent.findOne({ id: eventId });

            if (!event || event.status !== 'scheduled') {
                console.log(`⚠️ [Agenda] Skipping reminder - event cancelled or not found: ${eventId}`);
                return;
            }

            const reminder = event.reminders.find(r => r.id === reminderId);
            if (reminder) {
                reminder.sent = true;
                reminder.sentAt = new Date();
                await event.save();
            }

            const allRecipients = [ownerEmail, ...inviteeEmails.filter(e => e !== ownerEmail)];

            for (const email of allRecipients) {
                const socketId = getPreferredSocketId(email);
                if (socketId) {
                    IO.to(socketId).emit('brigidCalendarReminder', {
                        eventId,
                        title: eventTitle,
                        startTime: eventStartTime,
                        message: `Reminder: ${eventTitle} starts at ${moment(eventStartTime).format('LT')}`
                    });
                    console.log(`🔔 [Agenda] Socket reminder sent to ${email}`);
                }

                if (method === 'push') {
                    const user = await User.findOne({ email });
                    if (user && user.pushNotificationTokens?.length > 0) {
                        await sendEventReminderNotification(user.pushNotificationTokens, {
                            eventId,
                            eventTitle,
                            eventStartTime
                        });
                        console.log(`🔔 [Agenda] Push reminder sent to ${email}`);
                    }
                }
            }

            console.log(`✅ [Agenda] Sent reminder for event ${eventId} to ${allRecipients.length} recipients`);

        } catch (error) {
            console.error(`❌ [Agenda] Error processing brigid calendar reminder:`, error);
            throw error;
        }
    });

    // Inject agenda into brigid calendar service
    brigidCalendarService.setAgenda(agenda);

    await agenda.start(); // ✅ Wait for Agenda to initialize before scheduling
    // await agenda.schedule('in 5 seconds', 'schedule daily events'); // Safe now
    await agenda.cancel({ name: 'schedule daily events' });
    // await agenda.every('1 hour', 'schedule daily events'); // Safe now

    // Schedule Withings daily sync (every 24 hours at 2 AM)
    await agenda.cancel({ name: 'withings-daily-sync' }); // Cancel any existing jobs
    await agenda.every('24 hours', 'withings-daily-sync');
    console.log("✅ Withings daily sync scheduled (every 24 hours)");

    // await agenda.schedule('in 10 seconds', 'test')
    // // await agenda.schedule('in 15 seconds', 'notify user of event', {email:'ricksmith69@gmail.com', event: {summary: 'party time', start: '09:00'}})
    // const now = new Date();
    // const startOfDay = new Date(now.setHours(13, 16, 0, 0)).toISOString();
    // await agenda.schedule(startOfDay, 'notify user of event', {email:'ricksmith69@gmail.com', event: {summary: 'party time', start: {dateTime:'09:00'}}})
    // // await agenda.schedule('in 10 seconds', 'test')
    console.log("✅ Agenda initialized and scheduled tasks");
    return agenda;
};