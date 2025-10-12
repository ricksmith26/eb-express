import Agenda from 'agenda';
import CalendarController from '../controllers/CalendarController.js'
import User from '../models/User.js';
import { users } from '../socketIo/socketIo.js';
import {io as IO} from '../app.js'
import moment from 'moment';
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
            console.log('sending to:', users.get(email))
            IO.to(users.get(email)).emit('eventNotification', {
                title: event.summary,
                time: moment(event.start.dateTime).format('LT')
            });
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

    await agenda.start(); // ✅ Wait for Agenda to initialize before scheduling
    // await agenda.schedule('in 5 seconds', 'schedule daily events'); // Safe now
    await agenda.cancel({ name: 'schedule daily events' });
    // await agenda.every('1 hour', 'schedule daily events'); // Safe now
    // await agenda.schedule('in 10 seconds', 'test')
    // // await agenda.schedule('in 15 seconds', 'notify user of event', {email:'ricksmith69@gmail.com', event: {summary: 'party time', start: '09:00'}})
    // const now = new Date();
    // const startOfDay = new Date(now.setHours(13, 16, 0, 0)).toISOString();
    // await agenda.schedule(startOfDay, 'notify user of event', {email:'ricksmith69@gmail.com', event: {summary: 'party time', start: {dateTime:'09:00'}}})
    // // await agenda.schedule('in 10 seconds', 'test')
    console.log("✅ Agenda initialized and scheduled tasks");
    return agenda;
};